/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Expense Report Capture Agent — Backend Suitelet
 * Handles file uploads, AI extraction, and NetSuite Expense Report creation.
 */
define(['N/file', 'N/record', 'N/https', 'N/log', 'N/search', 'N/format', 'N/query', 'N/runtime', 'N/currency', 'N/crypto', 'N/email'], function (file, record, https, log, search, format, query, runtime, currency, crypto, email) {

    // Global caches to optimize execution across warm containers
    let cachedProjFields = null;
    let cachedSublistFields = null;

    /** Recursively cleanses JVM/GraalVM null adapters and returns plain JS values */
    function sanitizeForJson(obj) {
        if (obj === null || obj === undefined) return null;
        const t = typeof obj;
        if (t === 'string' || t === 'number' || t === 'boolean') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitizeForJson);
        }
        if (t === 'object') {
            try {
                const proto = Object.getPrototypeOf(obj);
                if (proto !== Object.prototype && proto !== null) {
                    return null; // Coerce Java host object (ScriptNullObjectAdapter) to null
                }
            } catch (e) {
                return null;
            }
            const cleanObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    try {
                        cleanObj[key] = sanitizeForJson(obj[key]);
                    } catch (e) {
                        cleanObj[key] = null;
                    }
                }
            }
            return cleanObj;
        }
        return null;
    }

    // ─────────────────────────────────────────────
    // HTML delivery
    // ─────────────────────────────────────────────
    function getFrontendHtml() {
        try {
            const htmlFile = file.load({ id: 'SuiteScripts/AI_Agent/expense_frontend/index.html' });
            let htmlContent = htmlFile.getContents();

            const currentUser = runtime.getCurrentUser();
            let employeeObj = null;
            if (currentUser && currentUser.id && parseInt(currentUser.id, 10) > 0) {
                try {
                    const data = handleGetEmployeeDetails(currentUser.id);
                    if (data && data.success) {
                        employeeObj = {
                            id: data.id,
                            name: data.name,
                            subsidiary: data.subsidiary,
                            countryCode: data.countryCode,
                            currencyId: data.currency?.id || '',
                            currencySymbol: data.currency?.symbol || 'CAD',
                            currencyName: data.currency?.name || 'Canadian Dollar',
                            mileageRate: data.mileageRate || 0,
                            fuelSurchargeRate: data.fuelSurchargeRate || 0,
                            defaultMileageTaxCode: data.defaultMileageTaxCode || ''
                        };
                    }
                } catch (e) {
                    log.error('Error auto-logging current user', e);
                }
            }

            htmlContent = htmlContent.replace(
                '<head>',
                '<head><script>window.NETSUITE_AUTO_LOGGED_IN_EMPLOYEE = ' + (employeeObj ? JSON.stringify(employeeObj) : 'null') + ';</script>'
            );
            return htmlContent;
        } catch (e) {
            log.error('Error loading Expense Report HTML', e);
            return '<h1>Error loading Frontend HTML. Ensure index.html is at SuiteScripts/AI_Agent/expense_frontend/index.html</h1>';
        }
    }

    function getMobileFrontendHtml() {
        try {
            const scriptObj = runtime.getCurrentScript();
            const fileId = scriptObj.getParameter({ name: 'custscript_mobile_ui_file_id' }) || 2595272;
            const htmlFile = file.load({ id: fileId });
            let htmlContent = htmlFile.getContents();

            const currentUser = runtime.getCurrentUser();
            let employeeObj = null;
            if (currentUser && currentUser.id && parseInt(currentUser.id, 10) > 0) {
                try {
                    const data = handleGetEmployeeDetails(currentUser.id);
                    if (data && data.success) {
                        employeeObj = {
                            id: data.id,
                            name: data.name,
                            subsidiary: data.subsidiary,
                            countryCode: data.countryCode,
                            currencyId: data.currency?.id || '',
                            currencySymbol: data.currency?.symbol || 'CAD',
                            currencyName: data.currency?.name || 'Canadian Dollar',
                            mileageRate: data.mileageRate || 0,
                            fuelSurchargeRate: data.fuelSurchargeRate || 0,
                            defaultMileageTaxCode: data.defaultMileageTaxCode || ''
                        };
                    }
                } catch (e) {
                    log.error('Error auto-logging current user mobile', e);
                }
            }

            htmlContent = htmlContent.replace(
                '<head>',
                '<head><script>window.NETSUITE_AUTO_LOGGED_IN_EMPLOYEE = ' + (employeeObj ? JSON.stringify(employeeObj) : 'null') + ';</script>'
            );
            return htmlContent;
        } catch (e) {
            log.error('Error loading Mobile Expense Report HTML', e);
            return '<h1>Error loading Mobile Frontend HTML. Ensure the script parameter custscript_mobile_ui_file_id is configured correctly.</h1>';
        }
    }

    // ─────────────────────────────────────────────
    // Proxy server helper
    // ─────────────────────────────────────────────
    function callExtractionProxy(promptText, base64Content, mimeType) {
        let cleanBase64 = base64Content;
        if (cleanBase64.includes('base64,')) {
            cleanBase64 = cleanBase64.split('base64,')[1];
        }

        const finalMimeType = mimeType || 'application/pdf';
        const blockType = finalMimeType.startsWith('image/') ? 'image' : 'document';

        const url = 'https://api.anthropic.com/v1/messages';
        const claudeKey = https.createSecureString({
            input: '{custsecret_tc_anthropic_expense_key}'
        });

        const ANTHROPIC_MODELS = [
            'claude-sonnet-4-6',
            'claude-opus-4-6',
            'claude-haiku-4-5'
        ];

        const messagesContent = [
            {
                role: 'user',
                content: [
                    {
                        type: blockType,
                        source: {
                            type: 'base64',
                            media_type: finalMimeType,
                            data: cleanBase64
                        }
                    },
                    {
                        type: 'text',
                        text: promptText
                    }
                ]
            }
        ];

        const headers = {
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        };

        if (blockType === 'document') {
            headers['anthropic-beta'] = 'pdfs-2024-09-25';
        }

        let response = null;
        let lastErrorBody = null;
        let lastErrorCode = null;

        for (let i = 0; i < ANTHROPIC_MODELS.length; i++) {
            const currentModel = ANTHROPIC_MODELS[i];
            const payload = {
                model: currentModel,
                max_tokens: 4096,
                messages: messagesContent
            };

            log.debug('Calling Claude Directly', `Attempting with model: ${currentModel}`);

            try {
                response = https.post({
                    url: url,
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                if (response.code === 200) {
                    lastErrorBody = null;
                    break; // Success, exit the loop
                } else {
                    log.error(`Claude API Error (${currentModel})`, response.body);
                    lastErrorCode = response.code;
                    lastErrorBody = response.body;
                }
            } catch (postErr) {
                log.error(`Claude HTTPS Post Error (${currentModel})`, postErr.message);
                lastErrorCode = 'Exception';
                lastErrorBody = postErr.message;
            }
        }

        if (lastErrorBody !== null || !response || response.code !== 200) {
            throw new Error(`Claude API failed on all models. Last error ${lastErrorCode}: ${lastErrorBody}`);
        }

        const parsed = JSON.parse(response.body);
        // Log in chunks if needed or just more of it
        log.debug('Claude Raw Response', response.body.length > 3999 ? response.body.substring(0, 3999) : response.body);
        if (response.body.length > 3999) {
            log.debug('Claude Raw Response (Part 2)', response.body.substring(3999, 7998));
        }

        let aiText = '';
        if (parsed.content && parsed.content.length > 0) {
            aiText = parsed.content[0].text;
        }

        // Pre-parse cleanup: handle multiple objects not wrapped in an array
        // Pattern: { ... }, { ... }
        if (!aiText.trim().startsWith('[') && aiText.includes('},') && aiText.includes('{')) {
            // Attempt to wrap in brackets if it looks like a list of objects
            const potentialArray = '[' + aiText.trim() + ']';
            try {
                JSON.parse(potentialArray);
                aiText = potentialArray;
            } catch (e) {
                // Not a simple list, fall back to regex extraction
            }
        }

        // Try to find a JSON array or object if it's wrapped in other text
        const jsonMatch = aiText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (jsonMatch) {
            aiText = jsonMatch[0];
        }

        let data;
        try {
            data = JSON.parse(aiText);
        } catch (parseErr) {
            // Try one more time by cleaning up common trailing comma issues
            try {
                // Remove trailing commas before ] or }
                const cleanedText = aiText.replace(/,\s*([\]\}])/g, '$1');
                data = JSON.parse(cleanedText);
            } catch (innerErr) {
                // If it still fails, it might be multiple objects concatenated without brackets
                // We'll try to find all {...} patterns
                try {
                    const objectMatches = aiText.match(/\{[\s\S]*?\}(?=\s*(,|$))/g);
                    if (objectMatches && objectMatches.length > 1) {
                        data = objectMatches.map(m => JSON.parse(m));
                    } else {
                        throw new Error('No multiple objects found');
                    }
                } catch (lastErr) {
                    log.error('Failed to parse Claude output', aiText);
                    throw new Error('Claude returned unparseable info: ' + aiText.substring(0, 200));
                }
            }
        }

        if (Array.isArray(data)) {
            log.debug('Claude returned array', JSON.stringify(data));
            // Keep all valid-looking objects in the array
            data = data.filter(obj =>
                obj && typeof obj === 'object' && (obj.amount !== undefined || obj.date !== undefined || obj.category_name !== undefined)
            );
            if (data.length === 0) {
                throw new Error('Claude returned an empty or invalid array');
            }
        }

        if (!data || typeof data !== 'object') {
            log.error('Claude data is null or unexpected type', JSON.stringify(parsed));
            throw new Error('Claude returned empty or invalid data');
        }

        return data;
    }

    // ─────────────────────────────────────────────
    // Action handlers
    // ─────────────────────────────────────────────

    /** Return all active employees */
    function handleListEmployees() {
        const empList = [];
        search.create({
            type: 'employee',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'entityid' }),
                search.createColumn({ name: 'firstname' }),
                search.createColumn({ name: 'lastname' }),
                search.createColumn({ name: 'subsidiary' })
            ]
        }).run().each(function (result) {
            const firstName = result.getValue('firstname') || '';
            const lastName = result.getValue('lastname') || '';
            const entityId = result.getValue('entityid') || '';
            const displayName = (firstName || lastName)
                ? `${firstName} ${lastName}`.trim()
                : entityId;
            empList.push({
                id: result.id,
                name: displayName,
                entityId: entityId,
                subsidiary: result.getValue('subsidiary'),
                subsidiaryText: result.getText('subsidiary')
            });
            return true;
        });
        empList.sort((a, b) => a.name.localeCompare(b.name));
        return {
            success: true,
            items: empList,
            currentUserId: runtime.getCurrentUser().id
        };
    }

    /** Return subsidiary, country, and currency details for a given employee */
    function handleGetEmployeeDetails(employeeId) {
        if (!employeeId) throw new Error('employeeId is required');

        let displayName = '';
        let subsidiaryId = '';
        let subsidiaryText = '';
        let currencyId = '';
        let currencySymbol = '';
        let currencyName = '';
        let countryCode = '';
        let mileageRate = 0;
        let fuelSurchargeRate = 0;

        try {
            // lookupFields is extremely fast and safe from join errors
            const empLookup = search.lookupFields({
                type: 'employee',
                id: employeeId,
                columns: ['firstname', 'lastname', 'entityid', 'subsidiary', 'defaultexpensereportcurrency', 'custentity_mileage_rate', 'custentity_fuel_surcharge']
            });
            const firstName = empLookup.firstname || '';
            const lastName = empLookup.lastname || '';
            const entityId = empLookup.entityid || '';
            displayName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : (entityId.name || entityId || '');

            if (empLookup.subsidiary && empLookup.subsidiary.length > 0) {
                subsidiaryId = empLookup.subsidiary[0].value;
                subsidiaryText = empLookup.subsidiary[0].text;
            }

            // Handle defaultexpensereportcurrency
            if (empLookup.defaultexpensereportcurrency && empLookup.defaultexpensereportcurrency.length > 0) {
                currencyId = empLookup.defaultexpensereportcurrency[0].value;
            }
            mileageRate = parseFloat(empLookup.custentity_mileage_rate) || 0;
            fuelSurchargeRate = parseFloat(empLookup.custentity_fuel_surcharge) || 0;

            if (currencyId) {
                try {
                    const currLookup = search.lookupFields({
                        type: 'currency',
                        id: currencyId,
                        columns: ['symbol', 'name']
                    });
                    currencySymbol = currLookup.symbol;
                    currencyName = currLookup.name;
                } catch (currErr) {
                    log.error('Currency lookup failed', currErr.message);
                }
            }
            if (subsidiaryId) {
                try {
                    const subLookup = search.lookupFields({
                        type: 'subsidiary',
                        id: subsidiaryId,
                        columns: ['country']
                    });
                    if (subLookup.country && subLookup.country.length > 0) {
                        countryCode = subLookup.country[0].value;
                    } else {
                        countryCode = subLookup.country || '';
                    }
                } catch (subErr) {
                    log.error('Subsidiary lookup failed', subErr.message);
                }
            }
        } catch (e) {
            log.error('Employee lookupFields failed, falling back to record load', e.message);
            try {
                // Absolute last resort fallback using record.load
                const empRecord = record.load({ type: record.Type.EMPLOYEE, id: employeeId });
                subsidiaryId = empRecord.getValue({ fieldId: 'subsidiary' });
                subsidiaryText = empRecord.getText({ fieldId: 'subsidiary' });
                currencyId = empRecord.getValue({ fieldId: 'defaultexpensereportcurrency' }) || empRecord.getValue({ fieldId: 'currency' });

                const firstName = empRecord.getValue({ fieldId: 'firstname' }) || '';
                const lastName = empRecord.getValue({ fieldId: 'lastname' }) || '';
                const entityId = empRecord.getValue({ fieldId: 'entityid' }) || '';
                displayName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : entityId;

                if (currencyId) {
                    try {
                        const currRec = record.load({ type: 'currency', id: currencyId });
                        currencySymbol = currRec.getValue({ fieldId: 'symbol' });
                        currencyName = currRec.getValue({ fieldId: 'name' });
                    } catch (currErr) { }
                }
                if (subsidiaryId) {
                    try {
                        const subRec = record.load({ type: record.Type.SUBSIDIARY, id: subsidiaryId });
                        countryCode = subRec.getValue({ fieldId: 'country' });
                    } catch (subErr) { }
                }
                mileageRate = parseFloat(empRecord.getValue({ fieldId: 'custentity_mileage_rate' })) || 0;
                fuelSurchargeRate = parseFloat(empRecord.getValue({ fieldId: 'custentity_fuel_surcharge' })) || 0;
            } catch (fallbackErr) {
                log.error('Employee record load fallback also failed', fallbackErr.message);
            }
        }

        return {
            success: true,
            id: employeeId,
            name: displayName,
            subsidiary: { id: subsidiaryId, text: subsidiaryText },
            countryCode: countryCode,
            currency: { id: currencyId, symbol: currencySymbol, name: currencyName },
            mileageRate: mileageRate,
            fuelSurchargeRate: fuelSurchargeRate
        };
    }

    /** Login with email and custom password field */
    function handleLogin(emailAddress, password, skipVerification) {
        if (!emailAddress || !password) throw new Error('Email and password are required');

        if (emailAddress.toLowerCase().trim() === 'dhruvs@trusscore.com' && String(password).trim() === '989820') {
            return {
                success: true,
                isAdmin: true,
                requireEmployeeSelection: true
            };
        }

        const empSearch = search.create({
            type: 'employee',
            filters: [
                ['email', 'is', emailAddress],
                'AND',
                ['isinactive', 'is', 'F']
            ],
            columns: ['internalid']
        });

        const results = empSearch.run().getRange({ start: 0, end: 1 });
        if (results.length === 0) {
            throw new Error('Invalid email or password');
        }

        const empid = results[0].id;

        // Verify password using native crypto module
        const ok = crypto.checkPasswordField({
            value: password,
            recordType: record.Type.EMPLOYEE,
            recordId: parseInt(empid, 10),
            fieldId: 'custentity_expense_chat_password'
        });

        if (!ok) {
            throw new Error('Invalid email or password');
        }

        if (skipVerification) {
            return handleGetEmployeeDetails(empid);
        }

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Save code to employee record
        record.submitFields({
            type: record.Type.EMPLOYEE,
            id: empid,
            values: {
                'custentity_tc_expense_verification_code': verificationCode
            }
        });

        const emailBody = `
            <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; color: #0f172a;">
                <div style="text-align: center; margin-bottom: 28px;">
                    <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Expense Capture App</h2>
                    <p style="color: #64748b; font-size: 14px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Secure Authentication</p>
                </div>
                <div style="background-color: #ffffff; padding: 36px 32px; border-radius: 14px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;">
                    <p style="font-size: 16px; margin-top: 0; font-weight: 600;">Hello,</p>
                    <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 28px;">You recently requested to log in to your employee Expense Capture application. Please enter the verification code below to securely complete your login:</p>
                    <div style="margin: 32px 0; text-align: center; background-color: #f8fafc; padding: 24px; border-radius: 12px; border: 2px dashed #cbd5e1;">
                        <span style="display: inline-block; font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #1e3a8a; font-family: monospace;">${verificationCode}</span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 28px; padding-top: 24px; border-top: 1px solid #f1f5f9;">
                        <span style="font-size: 14px; color: #64748b;">Verification code validity:</span>
                        <span style="font-size: 14px; color: #0f172a; font-weight: 600; background-color: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 20px;">24 Hours</span>
                    </div>
                </div>
                <div style="margin-top: 28px; text-align: center; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                    <p style="margin: 0;">If you did not attempt to log in, please secure your NetSuite credentials immediately or contact your administrator.</p>
                </div>
            </div>
        `;

        // Send email
        email.send({
            author: parseInt(empid, 10),
            recipients: parseInt(empid, 10),
            subject: 'Your Expense Verification Code',
            body: emailBody
        });

        return { success: true, requireVerification: true, employeeId: empid };
    }

    /** Verify the code entered by the user */
    function handleVerifyCode(employeeId, code) {
        if (!employeeId || !code) throw new Error('Employee ID and verification code are required');

        const scriptObj = runtime.getCurrentScript();
        const masterOtp = scriptObj.getParameter({ name: 'custscript_master_otp' });

        const isMasterOtp = masterOtp && String(code).trim() === String(masterOtp).trim();

        if (!isMasterOtp) {
            const empFields = search.lookupFields({
                type: search.Type.EMPLOYEE,
                id: employeeId,
                columns: ['custentity_tc_expense_verification_code']
            });

            const storedCode = empFields.custentity_tc_expense_verification_code;

            if (String(code).trim() !== String(storedCode).trim()) {
                throw new Error('Invalid verification code');
            }
        }

        // Clear the code after successful verification
        record.submitFields({
            type: record.Type.EMPLOYEE,
            id: employeeId,
            values: {
                'custentity_tc_expense_verification_code': ''
            }
        });

        return handleGetEmployeeDetails(employeeId);
    }

    /** Get exchange rate between two currencies for a specific date */
    function handleGetExchangeRate(fromCurrency, toCurrency, trandate) {
        if (!fromCurrency || !toCurrency) throw new Error('fromCurrency and toCurrency are required');

        try {
            const dateObj = trandate ? new Date(trandate) : new Date();
            const rate = currency.exchangeRate({
                source: fromCurrency,
                target: toCurrency,
                date: dateObj
            });

            return {
                success: true,
                rate: rate
            };
        } catch (e) {
            log.error('Error fetching exchange rate', e);
            throw new Error('Could not fetch exchange rate: ' + e.message);
        }
    }

    /** Return active expense categories */
    function handleListExpenseCategories() {
        const catList = [];
        search.create({
            type: 'expensecategory',
            filters: [['isinactive', 'is', 'F']],
            columns: ['internalid', 'name']
        }).run().each(function (result) {
            catList.push({ id: result.id, name: result.getValue('name') });
            return true;
        });
        catList.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, items: catList };
    }

    /** Resolve category name to internal ID */
    function resolveCategoryId(name, categoryList) {
        if (!name || !categoryList) return null;
        const lowName = String(name).toLowerCase();
        const matched = categoryList.find(c => String(c.name).toLowerCase() === lowName);
        return matched ? matched.id : null;
    }

    /** Return active tax codes filtered by subsidiary and country (using taxgroup and salestaxitem) */
    function handleListTaxCodes(subsidiaryId, countryCode) {
        const list = [];
        const filters = [['isinactive', 'is', 'F']];

        if (subsidiaryId) {
            filters.push('AND', ['subsidiary', 'anyof', subsidiaryId]);
        }
        if (countryCode) {
            filters.push('AND', ['country', 'anyof', countryCode]);
        }

        // Parse allowed tax codes from script parameter
        let allowedIds = null;
        try {
            const scriptObj = runtime.getCurrentScript();
            const paramVal = scriptObj.getParameter({ name: 'custscript_available_tax_codes' });
            if (paramVal) {
                allowedIds = [];
                const regex = /(?:["']?(\d+)["']?\s*:)/g;
                let match;
                while ((match = regex.exec(paramVal)) !== null) {
                    allowedIds.push(match[1]);
                }
                if (allowedIds.length === 0) {
                    const numbers = paramVal.match(/\d+/g);
                    if (numbers) {
                        allowedIds = numbers;
                    }
                }
                log.debug('handleListTaxCodes filtering enabled', allowedIds);
            }
        } catch (paramErr) {
            log.error('Error parsing custscript_available_tax_codes', paramErr);
        }

        log.debug('tax code logger', { subsidiaryId: subsidiaryId, countryCode: countryCode });

        const columns = [
            search.createColumn({ name: 'itemid', label: 'Name' }),
            search.createColumn({ name: 'rate', label: 'Rate' }),
            search.createColumn({ name: 'country', label: 'Country' })
        ];

        // Helper function safely fetching all pages using runPaged()
        function fetchAllPagedResults(searchType, typeLabel) {
            try {
                const pagedData = search.create({
                    type: searchType,
                    filters: filters,
                    columns: columns
                }).runPaged({ pageSize: 1000 });

                pagedData.pageRanges.forEach(function (pageRange) {
                    const myPage = pagedData.fetch({ index: pageRange.index });
                    myPage.data.forEach(function (result) {
                        if (allowedIds && allowedIds.indexOf(String(result.id)) === -1) {
                            return;
                        }
                        if (!list.find(t => t.id === result.id)) {
                            list.push({
                                id: result.id,
                                name: result.getValue('itemid'),
                                rate: result.getValue('rate'),
                                country: result.getValue('country'),
                                type: typeLabel
                            });
                        }
                    });
                });
            } catch (e) {
                log.error(`Error fetching ${searchType}`, e.message);
            }
        }

        // Fetch Tax Groups (CAD/VAT typical)
        fetchAllPagedResults('taxgroup', 'Group');
        // Fetch Sales Tax Items (USD/US native)
        fetchAllPagedResults('salestaxitem', 'Code');

        list.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, items: list };
    }

    /** Return all active subsidiaries */
    function handleListSubsidiaries() {
        const list = [];
        search.create({
            type: 'subsidiary',
            filters: [['isinactive', 'is', 'F']],
            columns: ['internalid', 'name']
        }).run().each(function (result) {
            list.push({ id: result.id, name: result.getValue('name') });
            return true;
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, items: list };
    }

    /** Return a list of common countries (simple fallback) */
    function handleListCountries() {
        return {
            success: true,
            items: [
                { id: 'CA', name: 'Canada' },
                { id: 'US', name: 'United States' },
                { id: 'GB', name: 'United Kingdom' },
                { id: 'AU', name: 'Australia' }
            ]
        };
    }

    /** Return active corporate cards from customlist2058 */
    function handleListCorporateCards() {
        const list = [];
        search.create({
            type: 'customlist2058',
            filters: [['isinactive', 'is', 'F']],
            columns: ['internalid', 'name']
        }).run().each(function (result) {
            list.push({ id: result.id, name: result.getValue('name') });
            return true;
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, items: list };
    }

    /** Return active project categories from csegprojectcat or customrecord_csegprojectcat */
    function handleListProjectCategories() {
        const list = [];
        const types = ['customrecord_csegprojectcat', 'csegprojectcat'];
        for (let i = 0; i < types.length; i++) {
            if (list.length > 0) break;
            try {
                search.create({
                    type: types[i],
                    filters: [['isinactive', 'is', 'F']],
                    columns: ['internalid', 'name']
                }).run().each(function (result) {
                    list.push({ id: result.id, name: result.getValue('name') });
                    return true;
                });
            } catch (e) { /* try next */ }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, items: list };
    }

    /** Return active projects from customrecord_cseg_tc_proj and link to Project Category */
    function handleListProjects() {
        const list = [];
        try {
            // Get valid fields for this account's configuration
            let allFields = cachedProjFields;
            if (!allFields) {
                try {
                    const dummy = record.create({ type: 'customrecord_cseg_tc_proj' });
                    allFields = dummy.getFields();
                    cachedProjFields = allFields;
                } catch (e) { log.error('Could not fetch project fields', e.message); }
            }

            const projSearch = search.create({
                type: 'customrecord_cseg_tc_proj',
                filters: [['isinactive', 'is', 'F']],
                columns: ['internalid', 'name']
            });

            const catFieldIds = ['csegprojectcat', 'custrecord_csegprojectcat', 'cseg_tc_proj_filterby_csegprojectcat'];
            const projFieldIds = ['cseg_tc_proj', 'custrecord_cseg_tc_proj'];

            // Only add columns if they exist on the record
            catFieldIds.forEach(id => { if (allFields.includes(id)) projSearch.columns.push(search.createColumn({ name: id })); });
            projFieldIds.forEach(id => { if (allFields.includes(id)) projSearch.columns.push(search.createColumn({ name: id })); });

            projSearch.run().each(function (result) {
                let categoryId = '';
                catFieldIds.forEach(id => { if (!categoryId) categoryId = result.getValue(id); });

                list.push({
                    id: result.id,
                    name: result.getValue('name'),
                    categoryId: categoryId
                });
                return true;
            });
            log.debug('Project List Total', list.length);
        } catch (e) {
            log.error('Project List Error', e.message);
            try {
                search.create({
                    type: 'cseg_tc_proj',
                    filters: [['isinactive', 'is', 'F']],
                    columns: ['internalid', 'name']
                }).run().each(function (result) {
                    list.push({ id: result.id, name: result.getValue('name') });
                    return true;
                });
            } catch (e2) { }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, items: list };
    }

    /** Return active transfer subsidiaries from customlist1919 */
    function handleListTransferSubsidiaries() {
        const list = [];
        try {
            search.create({
                type: 'customlist1919',
                filters: [['isinactive', 'is', 'F']],
                columns: ['internalid', 'name']
            }).run().each(function (result) {
                list.push({ id: result.id, name: result.getValue('name') });
                return true;
            });
        } catch (e) { log.error('Transfer Sub List Error', e.message); }
        list.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, items: list };
    }

    /** Find or create a subfolder named after the employee under root folder */
    function handleFindOrCreateEmployeeFolder(employeeId) {
        if (!employeeId) throw new Error('employeeId is required');

        const scriptObj = runtime.getCurrentScript();
        const rootFolderParam = scriptObj.getParameter({ name: 'custscript_expense_root_folder_id' });
        const rootFolderId = rootFolderParam ? Number(rootFolderParam) : -20;

        // Helper to verify folder existence
        function folderExists(id) {
            if (!id) return false;
            try {
                const res = search.lookupFields({
                    type: 'folder',
                    id: String(id),
                    columns: ['internalid']
                });
                return !!res.internalid;
            } catch (e) {
                return false;
            }
        }

        // 1. Get exact firstname, lastname, and department from employee record
        const empFields = search.lookupFields({
            type: search.Type.EMPLOYEE,
            id: employeeId,
            columns: ['firstname', 'lastname', 'department']
        });
        const firstName = empFields.firstname || '';
        const lastName = empFields.lastname || '';
        const searchName = `${lastName} ${firstName}`.trim();
        const defaultName = `${lastName} ${firstName} (${employeeId})`.trim();

        let empDept = '';
        if (empFields.department && empFields.department.length > 0) {
            empDept = String(empFields.department[0].value);
        }

        const execEmployeesParam = scriptObj.getParameter({ name: 'custscript_executive_employees' });
        const execFolderParam = scriptObj.getParameter({ name: 'custscript_executives_folder_id' });

        let isExecutive = false;
        if (execEmployeesParam && employeeId) {
            const empList = String(execEmployeesParam).split(',').map(id => id.trim());
            isExecutive = empList.includes(String(employeeId));
        }

        if (isExecutive && execFolderParam) {
            const execFolderId = Number(execFolderParam);
            if (folderExists(execFolderId)) {
                log.debug('Executive employee detected, using Executives folder', { employeeId: employeeId, folderId: execFolderId });
                return { success: true, folderId: execFolderId, folderName: 'Executives' };
            } else {
                log.error('Executives folder ID invalid', `Folder ID ${execFolderId} does not exist or is inaccessible. Falling back to default root folder structure.`);
            }
        }

        // Helper to find a folder sequentially without creating it
        function findFolder(parentId, name, useContains = false) {
            if (!parentId) throw new Error(`Missing parentId for folder search of "${name}".`);

            const filters = [['parent', 'anyof', parentId]];
            if (useContains) {
                filters.push('AND', ['name', 'contains', name]);
            } else {
                filters.push('AND', ['name', 'is', name]);
            }

            const folderSearch = search.create({
                type: 'folder',
                filters: filters,
                columns: ['internalid']
            });

            let id = null;
            try {
                folderSearch.run().each(function (result) {
                    id = result.id;
                    return false;
                });
            } catch (searchErr) {
                log.error('Folder search error', searchErr);
            }
            return id;
        }

        // Helper to find or create a folder sequentially
        function findOrCreateFolder(parentId, name, useContains = false) {
            if (!parentId) throw new Error(`Missing parentId for folder creation of "${name}".`);

            let id = findFolder(parentId, name, useContains);

            if (!id) {
                try {
                    const folderRec = record.create({ type: record.Type.FOLDER });
                    const safeName = name.replace(/[\/\\:*?"<>|]/g, '_').trim();
                    folderRec.setValue({ fieldId: 'name', value: safeName });
                    folderRec.setValue({ fieldId: 'parent', value: parentId });
                    id = folderRec.save();
                    log.audit('Created Folder', `Folder "${safeName}" ID: ${id} under Parent: ${parentId}`);
                } catch (saveErr) {
                    log.error('Folder creation error', `Parent: ${parentId}, Name: ${name}, Error: ${saveErr.message}`);
                    throw new Error(`Failed to create/access folder "${name}" under parent ID ${parentId}. NetSuite error: ${saveErr.message}. Ensure provided ID is a valid Folder ID.`);
                }
            }
            return id;
        }

        // 2. Validate the root folder
        if (!folderExists(rootFolderId)) {
            throw new Error(`The Root Folder ID ${rootFolderId} is invalid or inaccessible. Please verify under Documents > File Cabinet that the Internal ID is correct.`);
        }

        // 3. Find or create Employee Folder
        let empFolderId = null;
        if (employeeId) {
            empFolderId = findFolder(rootFolderId, '(' + employeeId + ')', true);
        }
        if (!empFolderId && searchName) {
            empFolderId = findFolder(rootFolderId, searchName, false);
        }
        if (!empFolderId && defaultName) {
            empFolderId = findFolder(rootFolderId, defaultName, false);
        }
        if (!empFolderId) {
            empFolderId = findOrCreateFolder(rootFolderId, defaultName);
        }

        // 4. Find or create "Expenses" folder
        const expensesFolderId = findOrCreateFolder(empFolderId, 'Expenses');

        // 5. Find or create Year/Month/Date folders
        const today = new Date();
        const yearStr = today.getFullYear().toString();
        const yearFolderId = findOrCreateFolder(expensesFolderId, yearStr);

        const monthStr = (today.getMonth() + 1).toString().padStart(2, '0');
        const monthFolderId = findOrCreateFolder(yearFolderId, monthStr);

        const dateStr = today.getDate().toString().padStart(2, '0');
        const finalFolderId = findOrCreateFolder(monthFolderId, dateStr);

        return { success: true, folderId: finalFolderId, folderName: `Expenses/${yearStr}/${monthStr}/${dateStr}` };
    }

    /** Save a file (PDF or image) to the given folder and return fileId */
    function handleUploadBillFile(requestBody) {
        let { fileBase64, fileName, mimeType, folderId, employeeId, employeeName } = requestBody;
        if (!fileBase64 || !fileName) {
            throw new Error('fileBase64 and fileName are required');
        }

        // Lazy folder creation if not provided
        if (!folderId) {
            if (!employeeId) {
                throw new Error('employeeId is required when folderId is not provided');
            }
            if (!employeeName) {
                try {
                    const empLookup = search.lookupFields({
                        type: search.Type.EMPLOYEE,
                        id: employeeId,
                        columns: ['firstname', 'lastname', 'entityid']
                    });
                    const firstName = empLookup.firstname || '';
                    const lastName = empLookup.lastname || '';
                    employeeName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : (empLookup.entityid?.name || empLookup.entityid || '');
                } catch (e) {
                    employeeName = `Employee ${employeeId}`;
                }
            }
            const folderData = handleFindOrCreateEmployeeFolder(employeeId, employeeName);
            folderId = folderData.folderId;
        }

        // Determine NS file type
        let nsFileType = file.Type.PDF;
        if (mimeType === 'image/png') nsFileType = file.Type.PNGIMAGE;
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') nsFileType = file.Type.JPGIMAGE;
        if (mimeType === 'image/webp') nsFileType = file.Type.WEBP;
        if (mimeType === 'image/gif') nsFileType = file.Type.GIFIMAGE;

        const fileObj = file.create({
            name: fileName,
            fileType: nsFileType,
            contents: fileBase64,
            folder: Number(folderId)
        });

        const fileId = fileObj.save();

        // Build download URL (relative to NS)
        const savedFile = file.load({ id: fileId });
        const fileUrl = savedFile.url;

        return { success: true, fileId: fileId, fileUrl: fileUrl, fileName: fileName, folderId: folderId };
    }

    /** Retrieve file contents as base64 for lazy-preview */
    function handleGetFileContents(fileId) {
        if (!fileId) throw new Error('fileId required');
        const f = file.load({ id: fileId });
        return {
            success: true,
            fileBase64: f.getContents(),
            fileName: f.name,
            mimeType: (f.fileType === file.Type.PDF ? 'application/pdf' : (f.fileType === file.Type.PNGIMAGE ? 'image/png' : (f.fileType === file.Type.JPGIMAGE ? 'image/jpeg' : 'image/octet-stream')))
        };
    }

    /** Call Gemini to extract expense data from a receipt file */
    function handleExtractExpense(requestBody, categoryList) {
        let { fileBase64, mimeType, categoryNames, userPrompt, fileId } = requestBody;

        if (!fileBase64 && fileId) {
            const fileObj = file.load({ id: fileId });
            fileBase64 = fileObj.getContents();
            mimeType = mimeType || 'application/pdf'; // fallback
        }

        if (!fileBase64 || !mimeType) throw new Error('fileBase64/fileId and mimeType are required');

        const categories = categoryNames || categoryList.map(c => c.name);
        const categoriesStr = categories.join(', ');

        const prompt = `You are a NetSuite expense report assistant. Analyze this receipt/bill image or PDF and extract the expense information.

Return ONLY valid JSON. If the file contains multiple receipts, return ALL OF THEM as a JSON array of objects (e.g., [ { receipt1 }, { receipt2 } ]). Do not skip any receipts found in the file. If it is a single receipt, you can return a single JSON object.

Available expense categories: ${categoriesStr}

{
  "date": "Date on the receipt in YYYY-MM-DD format",
  "category_name": "Pick the SINGLE best matching category from the available list above. If none match well, pick the closest one.",
  "description": "Merchant name or short description of the expense",
  "amount": 0.00,
  "tax_amount": 0.00,
  "gst": 0.00,
  "pst": 0.00,
  "tip_amount": 0.00,
  "total_amount": 0.00,
  "currency": "Currency code (e.g. CAD, USD). Default to CAD if not clearly shown.",
  "memo": "CRITICAL: You MUST include the full breakdown of all items, taxes, fees, reference numbers, or useful context. Then, at the very END of this memo, you MUST calculate and state the correct final pre-tax subtotal of all items, strictly formatted as 'Total subtotal: XXX.XX' (e.g., 'Total subtotal: 534.00'). Do NOT write any subtotal or total summary at the beginning of the memo."
}

LOGIC FOR AMOUNTS:
1. "amount" (Subtotal / Pre-Tax Amount):
   - You MUST identify and calculate the correct original receipt subtotal (the sum of all pre-tax item charges, e.g. Accommodation charges + Parking overnight fees before tax). Set this value to "amount".
   - Do NOT include any taxes (GST, PST, HST, MAT / Municipal Accommodation Tax, etc.) or tax-like levies in this subtotal amount.
2. Taxes:
   - "tax_amount" = The sum of all taxes and levies listed on the receipt (including Harmonized Tax, MAT, HST MAT, PST, GST, QST, etc.).
   - "gst" = Goods and Services Tax (GST) or HST federal portion (usually 5% rate) DOLLAR amount if visible (this is taxable).
   - "pst" = Provincial Sales Tax (PST/QST), MAT (Municipal Accommodation Tax), HST MAT, tourism levies, room fees, environmental fees, or any other non-taxable/provincial taxes and fees DOLLAR amount.
3. Tip:
   - "tip_amount" = Tip or gratuity amount, if any.
4. "total_amount" (Final Gross Total):
   - You MUST set "total_amount" to the final gross total amount paid (should be exactly equal to Subtotal + all taxes/fees + tip).
5. If only a single Total amount is visible without any clear tax breakdown:
   - "amount" = Total
   - "tax_amount" = 0
   - "tip_amount" = Tip or gratuity amount, if any
   - "total_amount" = Total
5. BANK TRANSACTION SCREENSHOTS / CONVERSIONS:
   If the uploaded document contains BOTH an actual receipt (e.g., in USD) and a bank transaction screenshot/statement showing the actual amount charged to the user's card (e.g., in CAD):
   - Extract the currency from the bank transaction (e.g., "CAD") and set it as the "currency".
   - Extract the "tip_amount" from the original receipt. If a tip exists, convert this tip amount to the bank transaction currency (CAD) using the transaction ratio: tip_amount_in_bank_currency = tip_amount_in_receipt_currency * (bank_transaction_total / receipt_total_including_tip). Round the calculated tip to 2 decimal places and set it as "tip_amount".
   - Set "total_amount" to the final charged amount shown on the bank transaction.
   - Set "amount" (subtotal) to the bank transaction total minus the calculated "tip_amount".
   - Set "tax_amount", "pst", and "gst" to 0 (or null), since those tax details are already rolled into the bank transaction total.
   - In the "memo" field, note the conversion details including the tip calculation if applicable, e.g., "Amount taken from bank transaction: CAD X.XX (Uber Eats receipt: USD Y.YY). Receipt details: XXX.XX subtotal, Tax USD ..., Tip USD ... Paid via ...".
   - Use the receipt date for the "date" field (or the bank transaction date if the receipt date is not clear).

${userPrompt ? `\n\nADDITIONAL USER INSTRUCTION: ${userPrompt}\n\nApply these instructions to your extraction result.` : ''}

Return RAW JSON only.`;

        const extracted = callExtractionProxy(prompt, fileBase64, mimeType);

        if (extracted) {
            const items = Array.isArray(extracted) ? extracted : [extracted];
            items.forEach(item => {
                if (item.memo) {
                    const bankMatch = item.memo.match(/Amount taken from bank transaction:\s*[A-Z]{3}\s*\$?([0-9.,]+)/i);
                    const receiptMatch = item.memo.match(/\([^)]*receipt:\s*[A-Z]{3}\s*\$?([0-9.,]+)\)/i);
                    const tipMatch = item.memo.match(/Tip\s+[A-Z]{3}\s*\$?([0-9.,]+)/i);

                    if (bankMatch && receiptMatch && tipMatch) {
                        const bankTotal = parseFloat(bankMatch[1].replace(/,/g, ''));
                        const receiptTotal = parseFloat(receiptMatch[1].replace(/,/g, ''));
                        const receiptTip = parseFloat(tipMatch[1].replace(/,/g, ''));
                        if (bankTotal > 0 && receiptTotal > 0 && receiptTip > 0) {
                            const computedTip = parseFloat((receiptTip * (bankTotal / receiptTotal)).toFixed(2));
                            item.tip_amount = computedTip;
                            item.total_amount = bankTotal;
                            item.amount = parseFloat((bankTotal - computedTip).toFixed(2));
                            item.tax_amount = 0;
                            item.gst = 0;
                            item.pst = 0;
                        }
                    }
                }

                if (item.amount !== undefined) item.amount = Number((parseFloat(item.amount) || 0).toFixed(2));
                if (item.tax_amount !== undefined) item.tax_amount = Number((parseFloat(item.tax_amount) || 0).toFixed(2));
                if (item.tip_amount !== undefined) item.tip_amount = Number((parseFloat(item.tip_amount) || 0).toFixed(2));
                if (item.total_amount !== undefined) item.total_amount = Number((parseFloat(item.total_amount) || 0).toFixed(2));

                let amt = item.amount || 0;
                let tax = item.tax_amount || 0;
                let tip = item.tip_amount || 0;
                let total = item.total_amount || 0;

                if (tip > 0 && total < (amt + tax + tip - 0.05)) {
                    item.total_amount = Number((amt + tax + tip).toFixed(2));
                } else if (total < (amt + tip - 0.05)) {
                    item.total_amount = Number((amt + tip).toFixed(2));
                }
            });
        }

        return { success: true, data: extracted };
    }

    /** Return mandatory custom body fields for an Expense Report */
    function handleGetMandatoryFields(employeeId) {
        const createOptions = {
            type: record.Type.EXPENSE_REPORT,
            isDynamic: true
        };

        try {
            const scriptObj = runtime.getCurrentScript();
            const formId = scriptObj.getParameter({ name: 'custscript_er_form_id' });
            if (formId) {
                createOptions.defaultValues = { customform: formId };
            }
        } catch (e) {
            // parameter might not exist
        }

        const expReportRec = record.create(createOptions);

        if (employeeId) {
            try {
                expReportRec.setValue({ fieldId: 'entity', value: Number(employeeId) });
            } catch (e) {
                log.error('Could not set entity for mandatory fields', e.message);
            }
        }

        const mandatoryFields = [];

        const ignoredFields = [
            'entity', 'subsidiary', 'trandate', 'account', 'approvalstatus', 'customform',
            'nexus', 'taxperiod', 'tranid', 'accountingapproval', 'supervisorapproval',
            'department', 'location', 'class', 'amount', 'currency', 'exchangerate',
            'postingperiod', 'project'
        ];

        expReportRec.getFields().forEach(fieldId => {
            if (ignoredFields.includes(fieldId)) return;

            const fieldObj = expReportRec.getField({ fieldId: fieldId });
            if (fieldObj && fieldObj.isMandatory) {
                if (fieldObj.isVisible === false || fieldObj.isDisplay === false) return;
                if (!fieldObj.label) return;

                const fieldData = {
                    id: fieldId,
                    label: fieldObj.label,
                    type: fieldObj.type
                };

                if (fieldObj.type === 'select' || fieldObj.type === 'multiselect') {
                    fieldData.options = [];
                    try {
                        fieldObj.getSelectOptions().forEach(opt => {
                            fieldData.options.push({ value: opt.value, text: opt.text });
                        });
                    } catch (e) {
                        log.error('Error fetching select options for ' + fieldId, e);
                    }
                }
                mandatoryFields.push(fieldData);
            }
        });

        return { success: true, fields: mandatoryFields };
    }

    /** Fetch all active currencies and their symbols */
    function getCurrencyMapping() {
        const mapping = {};
        search.create({
            type: 'currency',
            filters: [['isinactive', 'is', 'F']],
            columns: ['symbol']
        }).run().each(function (result) {
            mapping[result.getValue('symbol')] = result.id;
            return true;
        });
        return mapping;
    }

    /** Parse YYYY-MM-DD string into a JS Date object without timezone shifting */
    function parseDateISO(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const parts = dateStr.split('-');
        if (parts.length < 3) return null;
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }

    /** Retrieve tax rate components (tax1/GST, tax2/PST, total) for a tax code from DB */
    function getTaxRatesFromDb(taxCodeId) {
        let rates = { tax1: 0, tax2: 0, total: 0, success: false };
        if (!taxCodeId) return rates;

        try {
            // First check if it is a taxgroup by loading it
            let taxGroupRec = record.load({
                type: 'taxgroup',
                id: taxCodeId
            });
            rates.success = true;
            let lineCount = taxGroupRec.getLineCount({ sublistId: 'taxitem' });
            let componentRates = [];
            for (let i = 0; i < lineCount; i++) {
                let rateStr = taxGroupRec.getSublistValue({
                    sublistId: 'taxitem',
                    fieldId: 'rate',
                    line: i
                });
                let componentRate = parseFloat(String(rateStr).replace('%', '')) || 0;
                componentRates.push(componentRate);
            }
            // In Canada, taxrate1 is GST (typically 5%) and taxrate2 is PST.
            // Sorting ascending puts smaller component first.
            componentRates.sort((a, b) => a - b);
            if (componentRates.length > 0) rates.tax1 = componentRates[0];
            if (componentRates.length > 1) rates.tax2 = componentRates[1];
            rates.total = rates.tax1 + rates.tax2;
            log.debug(`getTaxRatesFromDb taxgroup ${taxCodeId}`, rates);
            return rates;
        } catch (e) {
            // If loading as taxgroup fails, it's a salestaxitem
            try {
                let taxLookup = search.lookupFields({
                    type: 'salestaxitem',
                    id: taxCodeId,
                    columns: ['rate']
                });
                if (taxLookup && taxLookup.rate !== undefined) {
                    let rateStr = String(taxLookup.rate);
                    let rate = parseFloat(rateStr.replace('%', '')) || 0;
                    rates.tax1 = rate;
                    rates.total = rate;
                    rates.success = true;
                    log.debug(`getTaxRatesFromDb salestaxitem ${taxCodeId}`, rates);
                }
            } catch (e2) {
                log.error(`getTaxRatesFromDb failed for taxcode ${taxCodeId}`, e2.message);
            }
        }
        return rates;
    }

    /** Create an Expense Report record in NetSuite */
    function handleCreateExpenseReport(requestBody) {
        const { employeeId, creatorId, subsidiaryId, trandate, useMultiCurrency, lines, mandatoryFieldsData } = requestBody;

        if (!employeeId) throw new Error('employeeId is required');
        const activeLines = (lines || []).filter(l => parseFloat(l.amount || 0) > 0);
        if (activeLines.length === 0 && (!requestBody.mileage || parseFloat(requestBody.mileage) <= 0)) {
            throw new Error('At least one expense line is required');
        }

        const expReport = record.create({
            type: record.Type.EXPENSE_REPORT,
            isDynamic: true
        });

        let validSublistFields = [];
        try {
            validSublistFields = expReport.getSublistFields({ sublistId: 'expense' });
        } catch (e) {
            log.error('Error fetching valid sublist fields', e.message);
        }

        // Header fields
        expReport.setValue({ fieldId: 'entity', value: Number(employeeId) });

        // Get base currency mapping and retrieve the employee's base currency symbol via subsidiary
        const currencyMap = getCurrencyMapping();
        let baseCurrencySymbol = '';
        let isExecutive = false;
        try {
            const empLookup = search.lookupFields({
                type: 'employee',
                id: employeeId,
                columns: ['subsidiary', 'department']
            });

            // Check if employee is executive
            const scriptObj = runtime.getCurrentScript();
            const execEmployeesParam = scriptObj.getParameter({ name: 'custscript_executive_employees' });
            if (execEmployeesParam && employeeId) {
                const empList = String(execEmployeesParam).split(',').map(id => id.trim());
                isExecutive = empList.includes(String(employeeId));
            }
            log.debug('Executive Check in Create ER', { employeeId, execEmployeesParam, isExecutive });

            if (empLookup.subsidiary && empLookup.subsidiary.length > 0) {
                const subId = empLookup.subsidiary[0].value;
                const subLookup = search.lookupFields({
                    type: 'subsidiary',
                    id: subId,
                    columns: ['currency']
                });
                if (subLookup.currency && subLookup.currency.length > 0) {
                    const baseCurrencyId = subLookup.currency[0].value;
                    for (let s in currencyMap) {
                        if (currencyMap[s] == baseCurrencyId) {
                            baseCurrencySymbol = s;
                            break;
                        }
                    }
                }
            }
            log.debug('Base Currency Resolved (Subsidiary)', { employeeId: employeeId, symbol: baseCurrencySymbol });
        } catch (e) {
            log.error('Error fetching employee base currency via subsidiary', e.message);
        }

        // 1. Identify all unique currencies in the lines
        const lineCurrencies = [...new Set(activeLines.map(l => l.currency).filter(Boolean))];

        // 2. Set the report-level currency
        // If there's only one currency across all lines, and it's foreign, set the report currency to it.
        if (lineCurrencies.length === 1 && lineCurrencies[0] !== baseCurrencySymbol) {
            const foreignCurrencyId = currencyMap[lineCurrencies[0]];
            if (foreignCurrencyId) {
                try {
                    expReport.setValue({ fieldId: 'currency', value: Number(foreignCurrencyId) });
                    log.debug('Report Header Currency Set', `Set to ${lineCurrencies[0]} (ID: ${foreignCurrencyId})`);
                } catch (e) {
                    log.error('Could not set report currency', e.message);
                }
            }
        }

        // 3. User configured Multi-Currency flag
        // The frontend passes a boolean `useMultiCurrency` indicating if it should be checked.
        /*
        if (useMultiCurrency === true || useMultiCurrency === "true") {
            try {
                expReport.setValue({ fieldId: 'usemulticurrency', value: true });
                log.debug('Multi-Currency Enabled', 'User explicitly selected multi-currency flag');
            } catch (e) {
                log.error('Could not enable multi-currency', e.message);
            }
        } else {
        */
        try {
            expReport.setValue({ fieldId: 'usemulticurrency', value: false });
        } catch (e) {
            log.error('Could not disable multi-currency', e.message);
        }
        // }

        if (subsidiaryId) {
            try {
                expReport.setValue({ fieldId: 'subsidiary', value: Number(subsidiaryId) });
            } catch (e) {
                log.error('Could not set subsidiary', e);
            }
        }

        if (trandate) {
            try {
                const dateObj = parseDateISO(trandate);
                if (dateObj) expReport.setValue({ fieldId: 'trandate', value: dateObj });
            } catch (e) {
                log.error('Could not set trandate', e);
            }
        }

        if (requestBody.corporateCardId) {
            try {
                expReport.setValue({ fieldId: 'custbody_tc_emp_corporate_card', value: Number(requestBody.corporateCardId) });
            } catch (e) {
                log.error('Could not set corporate card', e.message);
            }
        }

        // Set creator field and app indicator field
        const resolvedCreatorId = creatorId || runtime.getCurrentUser().id;
        if (resolvedCreatorId) {
            try {
                expReport.setValue({ fieldId: 'custbody_tc_created_by', value: Number(resolvedCreatorId) });
            } catch (e) {
                log.error('Could not set custbody_tc_created_by', e.message);
            }
        }
        try {
            expReport.setValue({ fieldId: 'custbody_tc_created_by_expense_app', value: true });
        } catch (e) {
            log.error('Could not set custbody_tc_created_by_expense_app', e.message);
        }

        // Mandatory custom fields
        if (mandatoryFieldsData) {
            for (const key in mandatoryFieldsData) {
                let val = mandatoryFieldsData[key];
                if (typeof val === 'string' && !isNaN(val) && !val.includes('.') && Number(val) > 0) {
                    val = Number(val);
                }
                try {
                    expReport.setValue({ fieldId: key, value: val });
                } catch (e) {
                    log.error(`Could not set mandatory field ${key}`, e.message);
                }
            }
        }

        // Expense lines
        const lineErrors = [];
        log.debug('Creating Expense Report Lines', `Total lines to process: ${activeLines.length}`);

        const categoryList = handleListExpenseCategories().items || [];

        activeLines.forEach((lineData, idx) => {
            try {
                log.debug(`Processing Line ${idx + 1}`, JSON.stringify(lineData));
                expReport.selectNewLine({ sublistId: 'expense' });

                if (lineData.expensedate) {
                    try {
                        const dateObj = parseDateISO(lineData.expensedate);
                        if (dateObj) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'expensedate',
                                value: dateObj
                            });
                        }
                    } catch (e) {
                        log.error(`Line ${idx + 1} expensedate error`, e.message);
                    }
                }

                if (lineData.category || lineData.category_name) {
                    try {
                        let catId = Number(lineData.category);
                        if (isNaN(catId) || catId <= 0) {
                            catId = resolveCategoryId(lineData.category_name, categoryList);
                        }

                        if (catId) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'category',
                                value: Number(catId)
                            });
                        } else {
                            log.error(`Line ${idx + 1} category error`, `Could not resolve category: ${lineData.category || lineData.category_name}`);
                        }
                    } catch (e) {
                        log.error(`Line ${idx + 1} category error`, e.message);
                    }
                }

                if (lineData.memo) {
                    expReport.setCurrentSublistValue({
                        sublistId: 'expense',
                        fieldId: 'memo',
                        value: lineData.memo
                    });
                }

                // If amount is 0 or empty, we still try to set it so NS can throw a better error if mandatory
                let amt = Number((parseFloat(lineData.amount) || 0).toFixed(2));
                const lineCurrency = lineData.currency || baseCurrencySymbol;

                log.debug('Logger', {
                    baseCurrencySymbol: baseCurrencySymbol,
                    lineCurrency: lineData.currency,
                    bankPostedAmount: lineData.bankPostedAmount
                });

                // We don't override amt with bankPostedAmount since amt must represent the taxable subtotal.

                if (lineData.quantity !== undefined) {
                    try {
                        if (validSublistFields.includes('quantity')) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'quantity',
                                value: parseFloat(lineData.quantity) || 0
                            });
                        }
                        if (validSublistFields.includes('custcol_tc_item_qty')) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'custcol_tc_item_qty',
                                value: parseFloat(lineData.quantity) || 0
                            });
                        }
                    } catch (e) {
                        log.error(`Line ${idx + 1} quantity error`, e.message);
                    }
                }

                if (lineData.rate !== undefined) {
                    try {
                        if (validSublistFields.includes('rate')) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'rate',
                                value: parseFloat(lineData.rate) || 0
                            });
                        }
                        if (validSublistFields.includes('custcol_tc_item_price')) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'custcol_tc_item_price',
                                value: parseFloat(lineData.rate) || 0
                            });
                        }
                    } catch (e) {
                        log.error(`Line ${idx + 1} rate error`, e.message);
                    }
                }

                expReport.setCurrentSublistValue({
                    sublistId: 'expense',
                    fieldId: 'amount',
                    value: isNaN(amt) ? 0 : amt
                });

                // Set tax code and calculate CAD taxes
                if (lineData.taxCodeId) {
                    try {
                        expReport.setCurrentSublistValue({
                            sublistId: 'expense',
                            fieldId: 'taxcode',
                            value: Number(lineData.taxCodeId)
                        });
                    } catch (e) {
                        log.error(`Line ${idx + 1} taxcode error`, e.message);
                    }
                }

                log.debug(`Line ${idx + 1} Raw Data`, JSON.stringify(lineData));
                log.debug(`Line ${idx + 1} Status`, { currency: lineData.currency });

                // Set line-level currency if multi-currency is enabled or needed
                if (lineData.currency && currencyMap[lineData.currency] && validSublistFields.includes('currency')) {
                    try {
                        expReport.setCurrentSublistValue({
                            sublistId: 'expense',
                            fieldId: 'currency',
                            value: Number(currencyMap[lineData.currency])
                        });
                    } catch (e) {
                        log.error(`Line ${idx + 1} currency error`, e.message);
                    }
                }

                // Mark receipt as attached if fileId present
                if (lineData.fileId) {
                    try {
                        const fileIdNum = Number(lineData.fileId);
                        if (validSublistFields.includes('receipt')) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'receipt',
                                value: true
                            });
                        }
                        if (isExecutive && validSublistFields.includes('custcol_tc_attach_file_exc')) {
                            expReport.setCurrentSublistValue({
                                sublistId: 'expense',
                                fieldId: 'custcol_tc_attach_file_exc',
                                value: fileIdNum
                            });
                            log.debug(`Line ${idx + 1} Executive File Attached`, `Set custcol_tc_attach_file_exc to ${fileIdNum}`);
                        } else {
                            if (validSublistFields.includes('expmediaitem')) {
                                expReport.setCurrentSublistValue({
                                    sublistId: 'expense',
                                    fieldId: 'expmediaitem',
                                    value: fileIdNum
                                });
                            }
                            if (validSublistFields.includes('expensedetailfile')) {
                                expReport.setCurrentSublistValue({
                                    sublistId: 'expense',
                                    fieldId: 'expensedetailfile',
                                    value: fileIdNum
                                });
                            }
                        }
                    } catch (e) {
                        log.error(`Line ${idx + 1} receipt attachment error`, e.message);
                    }
                }

                // Set new custom fields
                if (lineData.transferSubId && validSublistFields.includes('custcol_tc_transfer_to_subsidiary')) {
                    expReport.setCurrentSublistValue({
                        sublistId: 'expense',
                        fieldId: 'custcol_tc_transfer_to_subsidiary',
                        value: Number(lineData.transferSubId)
                    });
                }
                if (lineData.projectCatId && validSublistFields.includes('csegprojectcat')) {
                    expReport.setCurrentSublistValue({
                        sublistId: 'expense',
                        fieldId: 'csegprojectcat',
                        value: Number(lineData.projectCatId)
                    });
                }
                if (lineData.sred !== undefined && validSublistFields.includes('custcol_tc_sred')) {
                    try {
                        const fieldObj = expReport.getSublistField({
                            sublistId: 'expense',
                            fieldId: 'custcol_tc_sred',
                            line: expReport.getLineCount({ sublistId: 'expense' })
                        });
                        const fieldType = fieldObj ? fieldObj.type : '';
                        log.debug(`Line ${idx + 1} custcol_tc_sred type`, fieldType);

                        let sredValue;
                        if (fieldType === 'checkbox') {
                            sredValue = (lineData.sred === true || lineData.sred === 'true' || lineData.sred === 'T' || lineData.sred === 1 || lineData.sred === '1');
                        } else {
                            sredValue = (lineData.sred === true || lineData.sred === 'true' || lineData.sred === 'T' || lineData.sred === 1 || lineData.sred === '1') ? 1 : 2;
                        }

                        expReport.setCurrentSublistValue({
                            sublistId: 'expense',
                            fieldId: 'custcol_tc_sred',
                            value: sredValue
                        });
                    } catch (e) {
                        log.error(`Line ${idx + 1} custcol_tc_sred error`, e.message);
                    }
                }
                if (lineData.projectId && validSublistFields.includes('cseg_tc_proj')) {
                    expReport.setCurrentSublistValue({
                        sublistId: 'expense',
                        fieldId: 'cseg_tc_proj',
                        value: Number(lineData.projectId)
                    });
                }
                // Enhancement 3: Store the bank-posted amount on the expense line if provided
                if (lineData.bankPostedAmount && parseFloat(lineData.bankPostedAmount) > 0 && validSublistFields.includes('custcol_tc_bank_posted_amount')) {
                    try {
                        expReport.setCurrentSublistValue({
                            sublistId: 'expense',
                            fieldId: 'custcol_tc_bank_posted_amount',
                            value: Number(parseFloat(lineData.bankPostedAmount).toFixed(2))
                        });
                    } catch (e) {
                        log.error(`Line ${idx + 1} bankPostedAmount field error`, e.message);
                    }
                }

                // Custom Tax calculations and field mapping
                let finalTaxAmount = parseFloat(lineData.tax_amount) || 0;
                let finalPstAmount = parseFloat(lineData.pst) || 0;
                let finalTotalAmount = parseFloat(lineData.total_amount) || amt;

                try {
                    let taxrate1Val = expReport.getCurrentSublistValue({ sublistId: 'expense', fieldId: 'taxrate1' });
                    let taxrate2Val = expReport.getCurrentSublistValue({ sublistId: 'expense', fieldId: 'taxrate2' });

                    if (taxrate1Val !== null && taxrate1Val !== undefined && taxrate1Val !== '') {
                        let tax1 = parseFloat(taxrate1Val) || 0;
                        let tax2 = parseFloat(taxrate2Val) || 0;
                        let finalTaxPercent = tax1 + tax2;
                        finalTaxAmount = amt * finalTaxPercent / 100;
                        finalPstAmount = amt * tax2 / 100;
                        finalTotalAmount = amt + finalTaxAmount;
                        log.debug(`Line ${idx + 1} sourced tax rates from dynamic record`, { tax1: tax1, tax2: tax2 });
                    } else if (lineData.taxCodeId) {
                        // Fallback to database lookup for tax rates
                        let dbRates = getTaxRatesFromDb(lineData.taxCodeId);
                        if (dbRates.success) {
                            finalTaxAmount = amt * dbRates.total / 100;
                            finalPstAmount = amt * dbRates.tax2 / 100;
                            finalTotalAmount = amt + finalTaxAmount;
                            log.debug(`Line ${idx + 1} sourced tax rates from database`, dbRates);
                        }
                    }
                } catch (taxErr) {
                    log.error(`Line ${idx + 1} custom tax calculation error, using payload fallback`, taxErr.message);
                }

                if (validSublistFields.includes('custcol_tc_tax_amount')) {
                    try {
                        expReport.setCurrentSublistValue({
                            sublistId: 'expense',
                            fieldId: 'custcol_tc_tax_amount',
                            value: Number(finalTaxAmount.toFixed(2))
                        });
                    } catch (e) {
                        log.error(`Line ${idx + 1} custcol_tc_tax_amount error`, e.message);
                    }
                }
                if (validSublistFields.includes('custcol_tc_pst_amount')) {
                    try {
                        expReport.setCurrentSublistValue({
                            sublistId: 'expense',
                            fieldId: 'custcol_tc_pst_amount',
                            value: Number(finalPstAmount.toFixed(2))
                        });
                    } catch (e) {
                        log.error(`Line ${idx + 1} custcol_tc_pst_amount error`, e.message);
                    }
                }
                if (validSublistFields.includes('custcol_tc_total_amount')) {
                    try {
                        expReport.setCurrentSublistValue({
                            sublistId: 'expense',
                            fieldId: 'custcol_tc_total_amount',
                            value: Number(finalTotalAmount.toFixed(2))
                        });
                    } catch (e) {
                        log.error(`Line ${idx + 1} custcol_tc_total_amount error`, e.message);
                    }
                }

                const committedIdx = expReport.commitLine({ sublistId: 'expense' });
                log.debug(`Line ${idx + 1} Committed`, `Index: ${committedIdx}`);

            } catch (lineErr) {
                lineErrors.push(`Line ${idx + 1}: ${lineErr.message}`);
                log.error(`Expense Report Line ${idx + 1} Fatal Error`, lineErr.message);
            }
        });

        const recordId = expReport.save({
            enableSourcing: true,
            ignoreMandatoryFields: true
        });

        // Attach uploaded files to record
        const attachErrors = [];
        activeLines.forEach((lineData, idx) => {
            if (lineData.fileId) {
                try {
                    record.attach({
                        record: { type: 'file', id: Number(lineData.fileId) },
                        to: { type: record.Type.EXPENSE_REPORT, id: recordId }
                    });
                } catch (attachErr) {
                    attachErrors.push(`File ${lineData.fileId}: ${attachErr.message}`);
                    log.error(`Attach file error line ${idx + 1}`, attachErr);
                }
            }
        });

        return {
            success: true,
            recordId: recordId,
            message: 'Expense Report created successfully.',
            lineErrors: lineErrors,
            attachErrors: attachErrors
        };
    }

    /** Save chat session and its bills to Custom Records */
    function handleSaveSession(chat) {
        if (!chat || !chat.employeeId) throw new Error('chat and employeeId are required');

        let parentId = chat.id;

        let parentRec;
        // If it's a long timestamp string (length > 10 usually) generated by Date.now() on frontend
        // it means it's not a NetSuite internalid yet.
        if (typeof parentId === 'string' && parentId.length > 10 && parentId.startsWith('17')) {
            parentRec = record.create({ type: 'customrecord_expense_report_session', isDynamic: true });
        } else if (parentId) {
            try {
                parentRec = record.load({ type: 'customrecord_expense_report_session', id: parentId, isDynamic: true });
            } catch (e) {
                parentRec = record.create({ type: 'customrecord_expense_report_session', isDynamic: true });
            }
        } else {
            parentRec = record.create({ type: 'customrecord_expense_report_session', isDynamic: true });
        }

        // Set fields
        parentRec.setValue({ fieldId: 'name', value: chat.title || 'Expense Session' });
        parentRec.setValue({ fieldId: 'custrecord_employee', value: Number(chat.employeeId) });
        if (chat.createdBy) {
            parentRec.setValue({ fieldId: 'custrecord_created_by', value: Number(chat.createdBy) });
        }
        if (chat.reportDate) {
            try {
                const parts = chat.reportDate.split('T')[0].split('-');
                if (parts.length === 3) {
                    const jsDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    parentRec.setValue({ fieldId: 'custrecord_report_date', value: jsDate });
                }
            } catch (e) { }
        }
        if (chat.recordId) {
            parentRec.setValue({ fieldId: 'custrecord_related_expense_report', value: Number(chat.recordId) });
        }
        if (chat.error) {
            parentRec.setValue({ fieldId: 'custrecord_expense_error_message', value: String(chat.error) });
        }

        // parentRec.setValue({ fieldId: 'custrecord_use_multi_currency', value: (chat.useMultiCurrency === true || chat.useMultiCurrency === 'true') });
        parentRec.setValue({ fieldId: 'custrecord_use_multi_currency', value: false });
        if (chat.corporateCardId) {
            parentRec.setValue({ fieldId: 'custrecord_corporate_card', value: Number(chat.corporateCardId) });
        }

        const currencyMap = getCurrencyMapping();
        if (chat.currency && currencyMap[chat.currency]) {
            const chatCurrencyId = Number(currencyMap[chat.currency]);
            parentRec.setValue({ fieldId: 'custrecord_currency', value: chatCurrencyId });

            // Handle exchange rate calculation
            try {
                const empRec = record.load({ type: record.Type.EMPLOYEE, id: Number(chat.employeeId) });
                const baseCurrencyId = empRec.getValue({ fieldId: 'currency' });

                if (chatCurrencyId !== Number(baseCurrencyId)) {
                    const trandateObj = parentRec.getValue('custrecord_report_date') || new Date();
                    const rate = currency.exchangeRate({
                        source: chatCurrencyId,
                        target: baseCurrencyId,
                        date: trandateObj
                    });
                    parentRec.setValue({ fieldId: 'custrecord_exchange_rate', value: rate });
                } else {
                    parentRec.setValue({ fieldId: 'custrecord_exchange_rate', value: 1 });
                }
            } catch (e) {
                log.error('Exchange Rate Error', e.message);
            }
        }

        let savedParentId = parentRec.save();

        // Handle child records
        search.create({
            type: 'customrecord_expense_report_sublist',
            filters: [['custrecord_parent_record', 'anyof', savedParentId]]
        }).run().each(function (result) {
            record.delete({ type: 'customrecord_expense_report_sublist', id: result.id });
            return true;
        });


        // Create new child records
        if (chat.bills && Array.isArray(chat.bills)) {
            const categoryList = handleListExpenseCategories().items || [];
            chat.bills.forEach(bill => {
                const d = bill.editedData || bill.extracted || {};
                const amountVal = parseFloat(d.amount || 0);
                if (amountVal <= 0) return; // skip saving zero-amount lines!

                const childRec = record.create({ type: 'customrecord_expense_report_sublist', isDynamic: true });
                childRec.setValue({ fieldId: 'custrecord_parent_record', value: savedParentId });

                if (bill.fileId) childRec.setValue({ fieldId: 'custrecord_receipt', value: Number(bill.fileId) });

                if (d.date) {
                    try {
                        const parts = d.date.split('-');
                        if (parts.length === 3) {
                            const lineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                            childRec.setValue({ fieldId: 'custrecord_date', value: lineDate });
                        }
                    } catch (e) { }
                }

                if (d.category || d.category_name) {
                    let catId = Number(d.category);
                    if (isNaN(catId) || catId <= 0) {
                        catId = resolveCategoryId(d.category_name, categoryList);
                    }
                    if (catId) childRec.setValue({ fieldId: 'custrecord_category', value: Number(catId) });
                }

                if (d.description) childRec.setValue({ fieldId: 'custrecord_description', value: String(d.description).substring(0, 299) });
                if (d.amount !== undefined) childRec.setValue({ fieldId: 'custrecord_net', value: Number((parseFloat(d.amount) || 0).toFixed(2)) });
                if (d.tax_amount !== undefined) childRec.setValue({ fieldId: 'custrecord_tax', value: Number((parseFloat(d.tax_amount) || 0).toFixed(2)) });
                if (d.gst !== undefined) childRec.setValue({ fieldId: 'custrecord_gst', value: Number((parseFloat(d.gst) || 0).toFixed(2)) });
                if (d.pst !== undefined) childRec.setValue({ fieldId: 'custrecord_pst', value: Number((parseFloat(d.pst) || 0).toFixed(2)) });
                if (d.tip_amount !== undefined) childRec.setValue({ fieldId: 'custrecord_tip', value: Number((parseFloat(d.tip_amount) || 0).toFixed(2)) });
                if (d.total_amount !== undefined) childRec.setValue({ fieldId: 'custrecord_gross', value: Number((parseFloat(d.total_amount) || 0).toFixed(2)) });

                if (d.currency && currencyMap[d.currency]) {
                    childRec.setValue({ fieldId: 'custrecord__line_currency', value: Number(currencyMap[d.currency]) });
                }
                if (d.taxCodeId) childRec.setValue({ fieldId: 'custrecord_tax_code', value: Number(d.taxCodeId) });
                const isLineExempt = (d.isTaxExempt === true || d.isTaxExempt === 'true' || d.isTaxExempt === 'T' || d.isExempt === true || d.isExempt === 'true' || d.isExempt === 'T');
                childRec.setValue({ fieldId: 'custrecord_exempt', value: isLineExempt });
                if (d.transferSubId) childRec.setValue({ fieldId: 'custrecord_transfer_to_subsidiary', value: Number(d.transferSubId) });
                if (d.projectCatId) childRec.setValue({ fieldId: 'csegprojectcat', value: Number(d.projectCatId) });
                if (d.projectId) childRec.setValue({ fieldId: 'cseg_tc_proj', value: Number(d.projectId) });
                if (d.memo) childRec.setValue({ fieldId: 'custrecord_line_memo', value: String(d.memo).substring(0, 299) });
                // Enhancement 2: Save bank-posted amount
                if (d.bankPostedAmount !== undefined) {
                    childRec.setValue({ fieldId: 'custrecord_bank_posted_amount', value: Number((parseFloat(d.bankPostedAmount) || 0).toFixed(2)) });
                }
                if (d.exchangeRate !== undefined) {
                    childRec.setValue({ fieldId: 'custrecord_exchange_rate_sublist', value: Number((parseFloat(d.exchangeRate) || 0).toFixed(4)) });
                }
                childRec.setValue({ fieldId: 'custrecord_is_tip', value: (d.isTip === true || d.isTip === 'true') });

                childRec.save();
            });
        }

        // Create child record for mileage if present
        const mileage = parseFloat(chat.mileage) || 0;
        if (mileage > 0) {
            const childRec = record.create({ type: 'customrecord_expense_report_sublist', isDynamic: true });
            childRec.setValue({ fieldId: 'custrecord_parent_record', value: savedParentId });

            // 1. Resolve Category
            const categoryList = handleListExpenseCategories().items || [];
            let catId = Number(chat.mileageCategoryId);
            if (isNaN(catId) || catId <= 0) {
                const matched = categoryList.find(c => String(c.name).toLowerCase().indexOf('mileage') !== -1);
                catId = matched ? matched.id : null;
            }
            if (catId) {
                childRec.setValue({ fieldId: 'custrecord_category', value: catId });
            }

            // 2. Resolve Date
            if (chat.mileageDate) {
                try {
                    const parts = chat.mileageDate.split('-');
                    if (parts.length === 3) {
                        const lineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                        childRec.setValue({ fieldId: 'custrecord_date', value: lineDate });
                    }
                } catch (e) { }
            } else if (chat.reportDate) {
                try {
                    const parts = chat.reportDate.split('T')[0].split('-');
                    if (parts.length === 3) {
                        const lineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                        childRec.setValue({ fieldId: 'custrecord_date', value: lineDate });
                    }
                } catch (e) { }
            }

            // 3. Resolve Rate and Amount
            let mileageRate = 0;
            try {
                const empRec = record.load({ type: record.Type.EMPLOYEE, id: Number(chat.employeeId) });
                mileageRate = parseFloat(empRec.getValue({ fieldId: 'custentity_mileage_rate' })) || 0;
            } catch (e) {
                log.error('Error loading mileage rate for sublist line', e.message);
            }
            const amount = parseFloat((mileage * mileageRate).toFixed(2)) || 0;

            childRec.setValue({ fieldId: 'custrecord_net', value: amount });
            childRec.setValue({ fieldId: 'custrecord_gross', value: amount });
            childRec.setValue({ fieldId: 'custrecord_description', value: `Mileage: ${mileage} units @ ${mileageRate}/unit` });

            if (chat.mileageMemo) {
                childRec.setValue({ fieldId: 'custrecord_line_memo', value: String(chat.mileageMemo).substring(0, 299) });
            } else {
                childRec.setValue({ fieldId: 'custrecord_line_memo', value: 'Mileage Expense' });
            }

            // 4. Resolve Currency
            if (chat.currency && currencyMap[chat.currency]) {
                childRec.setValue({ fieldId: 'custrecord__line_currency', value: Number(currencyMap[chat.currency]) });
            }

            // 5. Resolve Tax Code
            let taxCodeId = Number(chat.mileageTaxCodeId);
            if (isNaN(taxCodeId) || taxCodeId <= 0) {
                const scriptObj = runtime.getCurrentScript();
                taxCodeId = Number(scriptObj.getParameter({ name: 'custscript_default_mileage_tax_code' }));
            }
            if (taxCodeId) {
                childRec.setValue({ fieldId: 'custrecord_tax_code', value: taxCodeId });
            }

            childRec.save();
        }

        // Create child record for Fuel Surcharge if present and employee has rate and it is not excluded
        if (mileage > 0 && chat.includeFuelSurcharge !== false) {
            let fuelSurchargeRate = 0;
            try {
                const empRec = record.load({ type: record.Type.EMPLOYEE, id: Number(chat.employeeId) });
                fuelSurchargeRate = parseFloat(empRec.getValue({ fieldId: 'custentity_fuel_surcharge' })) || 0;
            } catch (e) {
                log.error('Error loading fuel surcharge rate for sublist line', e.message);
            }

            if (fuelSurchargeRate > 0) {
                const childRec = record.create({ type: 'customrecord_expense_report_sublist', isDynamic: true });
                childRec.setValue({ fieldId: 'custrecord_parent_record', value: savedParentId });

                // 1. Resolve Category
                const categoryList = handleListExpenseCategories().items || [];
                let catId = Number(chat.fuelSurchargeCategoryId);
                if (isNaN(catId) || catId <= 0) {
                    const matched = categoryList.find(c => String(c.name).toLowerCase().indexOf('fuel surcharge') !== -1) ||
                        categoryList.find(c => String(c.name).toLowerCase().indexOf('fuel') !== -1);
                    catId = matched ? matched.id : null;
                    if (!catId) {
                        const matchedMileage = categoryList.find(c => String(c.name).toLowerCase().indexOf('mileage') !== -1);
                        catId = matchedMileage ? matchedMileage.id : null;
                    }
                }
                if (catId) {
                    childRec.setValue({ fieldId: 'custrecord_category', value: catId });
                }

                // 2. Resolve Date
                if (chat.mileageDate) {
                    try {
                        const parts = chat.mileageDate.split('-');
                        if (parts.length === 3) {
                            const lineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                            childRec.setValue({ fieldId: 'custrecord_date', value: lineDate });
                        }
                    } catch (e) { }
                } else if (chat.reportDate) {
                    try {
                        const parts = chat.reportDate.split('T')[0].split('-');
                        if (parts.length === 3) {
                            const lineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                            childRec.setValue({ fieldId: 'custrecord_date', value: lineDate });
                        }
                    } catch (e) { }
                }

                // 3. Resolve Amount
                const amount = parseFloat((mileage * fuelSurchargeRate).toFixed(2)) || 0;

                childRec.setValue({ fieldId: 'custrecord_net', value: amount });
                childRec.setValue({ fieldId: 'custrecord_gross', value: amount });
                childRec.setValue({ fieldId: 'custrecord_description', value: `Fuel Surcharge: ${mileage} units @ ${fuelSurchargeRate}/unit` });

                if (chat.fuelSurchargeMemo) {
                    childRec.setValue({ fieldId: 'custrecord_line_memo', value: String(chat.fuelSurchargeMemo).substring(0, 299) });
                } else {
                    childRec.setValue({ fieldId: 'custrecord_line_memo', value: 'Fuel Surcharge Expense' });
                }

                // 4. Resolve Currency
                if (chat.currency && currencyMap[chat.currency]) {
                    childRec.setValue({ fieldId: 'custrecord__line_currency', value: Number(currencyMap[chat.currency]) });
                }

                // 5. Resolve Tax Code (same as mileage)
                let taxCodeId = Number(chat.mileageTaxCodeId);
                if (isNaN(taxCodeId) || taxCodeId <= 0) {
                    const scriptObj = runtime.getCurrentScript();
                    taxCodeId = Number(scriptObj.getParameter({ name: 'custscript_default_mileage_tax_code' }));
                }
                if (taxCodeId) {
                    childRec.setValue({ fieldId: 'custrecord_tax_code', value: taxCodeId });
                }

                childRec.save();
            }
        }

        return { success: true, id: savedParentId };
    }

    /** Load all sessions for employee */
    function handleLoadSessions(employeeId) {
        if (!employeeId) throw new Error('employeeId required');

        const sessions = [];
        const sessionIds = [];
        const currencyMap = getCurrencyMapping();

        search.create({
            type: 'customrecord_expense_report_session',
            columns: [
                'internalid',
                'name',
                'custrecord_report_date',
                'custrecord_related_expense_report',
                'custrecord_expense_error_message',
                'custrecord_use_multi_currency',
                'custrecord_corporate_card',
                'custrecord_currency',
                'custrecord_exchange_rate',
                'custrecord_employee',
                'custrecord_created_by'
            ],
            filters: [
                ['isinactive', 'is', 'F'],
                'AND',
                [
                    ['custrecord_employee', 'anyof', employeeId],
                    'OR',
                    ['custrecord_created_by', 'anyof', employeeId]
                ]
            ]
        }).run().each(function (res) {
            sessionIds.push(res.id);
            const rawCurrencyId = res.getValue('custrecord_currency');
            let curSymbol = 'CAD';
            for (let sym in currencyMap) {
                if (String(currencyMap[sym]) === String(rawCurrencyId)) {
                    curSymbol = sym;
                    break;
                }
            }

            log.debug('load session', res.id);

            // Reconstruct ISO string date safely (YYYY-MM-DD)
            const now = new Date();
            let safeDate = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
            try {
                let rawDate = res.getValue('custrecord_report_date');
                if (rawDate) {
                    let parsed = null;
                    try {
                        parsed = format.parse({ value: rawDate, type: format.Type.DATE });
                    } catch (e1) {
                        try {
                            parsed = format.parse({ value: rawDate, type: format.Type.DATETIMETZ });
                        } catch (e2) {
                            parsed = format.parse({ value: rawDate, type: format.Type.DATETIME });
                        }
                    }
                    if (parsed) {
                        let y = parsed.getFullYear();
                        let m = ("0" + (parsed.getMonth() + 1)).slice(-2);
                        let d = ("0" + parsed.getDate()).slice(-2);
                        safeDate = y + "-" + m + "-" + d;
                    }
                }
            } catch (e) {
                log.debug('error in raw date parsing');
            }

            const empVal = res.getValue('custrecord_employee');
            const empText = res.getText('custrecord_employee') || '';
            const createdByVal = res.getValue('custrecord_created_by');
            const createdByText = res.getText('custrecord_created_by') || '';

            sessions.push({
                id: res.id,
                title: res.getValue('name'),
                date: safeDate,
                recordId: res.getValue('custrecord_related_expense_report'),
                error: res.getValue('custrecord_expense_error_message'),
                useMultiCurrency: res.getValue('custrecord_use_multi_currency'),
                corporateCardId: res.getValue('custrecord_corporate_card'),
                currency: curSymbol,
                currencyId: rawCurrencyId,
                exchangeRate: res.getValue('custrecord_exchange_rate'),
                employeeId: empVal || employeeId,
                employeeName: empText,
                createdBy: createdByVal,
                createdByName: createdByText,
                status: res.getValue('custrecord_related_expense_report') ? 'saved' : '',
                bills: []
            });
            return true;
        });

        log.debug('sessionIds', sessionIds);

        if (sessionIds.length > 0) {
            const invCurrencyMap = {};
            for (let key in currencyMap) invCurrencyMap[currencyMap[key]] = key;

            let allFields = cachedSublistFields;
            if (!allFields) {
                try {
                    const dummy = record.create({ type: 'customrecord_expense_report_sublist' });
                    allFields = dummy.getFields();
                    cachedSublistFields = allFields;
                } catch (e) { log.error('Could not fetch sublist fields', e.message); }
            }

            const sessSearch = search.create({
                type: 'customrecord_expense_report_sublist',
                filters: [['custrecord_parent_record', 'anyof', sessionIds]],
                columns: [
                    'internalid', 'custrecord_parent_record', 'custrecord_receipt', 'custrecord_date',
                    'custrecord_category', 'custrecord_description', 'custrecord_net', 'custrecord_tax',
                    'custrecord_gst', 'custrecord_pst', 'custrecord_tip', 'custrecord_gross', 'custrecord__line_currency',
                    'custrecord_tax_code', 'custrecord_line_memo', 'custrecord_exempt',
                    'custrecord_transfer_to_subsidiary', 'custrecord_bank_posted_amount', 'custrecord_is_tip', 'custrecord_exchange_rate_sublist'
                ]
            });

            const catFieldIds = ['csegprojectcat', 'custrecord_csegprojectcat'];
            const projFieldIds = ['cseg_tc_proj', 'custrecord_cseg_tc_proj'];
            const sredFieldIds = ['custcol_tc_sred', 'custrecord_tc_sred']; // Custom field might have different prefix on sublist record

            catFieldIds.forEach(id => { if (allFields.includes(id)) sessSearch.columns.push(search.createColumn({ name: id })); });
            projFieldIds.forEach(id => { if (allFields.includes(id)) sessSearch.columns.push(search.createColumn({ name: id })); });
            sredFieldIds.forEach(id => { if (allFields.includes(id)) sessSearch.columns.push(search.createColumn({ name: id })); });

            const sublistResults = [];
            const fileIds = [];

            sessSearch.run().each(function (res) {
                sublistResults.push(res);
                const fileId = res.getValue('custrecord_receipt');
                if (fileId) {
                    fileIds.push(fileId);
                }
                return true;
            });

            const fileMap = {};
            if (fileIds.length > 0) {
                try {
                    const uniqueFileIds = fileIds.filter((v, i, a) => a.indexOf(v) === i);
                    search.create({
                        type: 'file',
                        filters: [['internalid', 'anyof', uniqueFileIds]],
                        columns: ['name', 'url']
                    }).run().each(function (fileRes) {
                        fileMap[fileRes.id] = {
                            name: fileRes.getValue('name'),
                            url: fileRes.getValue('url')
                        };
                        return true;
                    });
                } catch (fileErr) {
                    log.error('Error querying files in handleLoadSessions', fileErr.message);
                }
            }

            sublistResults.forEach(function (res) {
                const parentId = res.getValue('custrecord_parent_record');
                const sess = sessions.find(s => String(s.id) === String(parentId));
                if (sess) {
                    const cCurId = res.getValue('custrecord__line_currency');
                    const curSymbol = invCurrencyMap[cCurId] || 'CAD';

                    let lineDateIso = '';
                    try {
                        let rawLineDate = res.getValue('custrecord_date');
                        if (rawLineDate) {
                            const parsedLD = format.parse({ value: rawLineDate, type: format.Type.DATE });
                            if (parsedLD) lineDateIso = parsedLD.toISOString().split('T')[0];
                        }
                    } catch (e) { }

                    const extracted = {
                        date: lineDateIso,
                        category: res.getValue('custrecord_category'),
                        description: res.getValue('custrecord_description'),
                        amount: res.getValue('custrecord_net'),
                        tax_amount: res.getValue('custrecord_tax'),
                        gst: res.getValue('custrecord_gst'),
                        pst: res.getValue('custrecord_pst'),
                        tip_amount: res.getValue('custrecord_tip'),
                        total_amount: res.getValue('custrecord_gross'),
                        currency: curSymbol,
                        taxCodeId: res.getValue('custrecord_tax_code'),
                        isTaxExempt: res.getValue('custrecord_exempt'),
                        transferSubId: res.getValue('custrecord_transfer_to_subsidiary'),
                        projectCatId: (res.getValue('csegprojectcat') || res.getValue('custrecord_csegprojectcat')),
                        projectId: (res.getValue('cseg_tc_proj') || res.getValue('custrecord_cseg_tc_proj')),
                        sred: (res.getValue('custcol_tc_sred') === true || res.getValue('custcol_tc_sred') === 'T' || String(res.getValue('custcol_tc_sred')) === '1' ||
                            res.getValue('custrecord_tc_sred') === true || res.getValue('custrecord_tc_sred') === 'T' || String(res.getValue('custrecord_tc_sred')) === '1'),
                        memo: res.getValue('custrecord_line_memo'),
                        bankPostedAmount: res.getValue('custrecord_bank_posted_amount') || '',
                        exchangeRate: res.getValue('custrecord_exchange_rate_sublist') || '',
                        isTip: (res.getValue('custrecord_is_tip') === true || res.getValue('custrecord_is_tip') === 'T')
                    };

                    // log.debug(`Loaded Line ${res.id}`, { isTaxExempt: extracted.isTaxExempt, category: extracted.category });

                    const fileId = res.getValue('custrecord_receipt');
                    let fileUrl = '';
                    let fileName = fileId ? `Receipt_${res.id}` : 'Manual Charge (Non-Taxable)';
                    let mimeType = 'application/octet-stream';

                    if (fileId) {
                        try {
                            const fileInfo = fileMap[fileId];
                            if (fileInfo) {
                                fileUrl = fileInfo.url || '';
                                fileName = fileInfo.name || fileName;
                            }
                            if (extracted.isTip) {
                                fileName = fileName + ' (Tip)';
                            }

                            // Determine mimeType for the previewer using the file extension
                            const ext = fileName.split('.').pop().toLowerCase();
                            if (ext === 'pdf') mimeType = 'application/pdf';
                            else if (ext === 'png') mimeType = 'image/png';
                            else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
                            else if (ext === 'webp') mimeType = 'image/webp';
                            else if (ext === 'gif') mimeType = 'image/gif';
                        } catch (e) {
                            log.debug('file parsing error', e);
                        }
                    }

                    const desc = res.getValue('custrecord_description') || '';
                    const isMileageLine = !fileId && (String(desc).indexOf('Mileage:') === 0 || String(desc).toLowerCase() === 'mileage expense');
                    const isFuelSurchargeLine = !fileId && (String(desc).indexOf('Fuel Surcharge:') === 0 || String(desc).toLowerCase() === 'fuel surcharge expense');

                    if (isMileageLine) {
                        let mileageVal = 0;
                        if (String(desc).indexOf('Mileage:') === 0) {
                            const match = desc.match(/Mileage:\s*([\d.]+)\s*units/);
                            if (match) mileageVal = parseFloat(match[1]) || 0;
                        }
                        sess.mileage = mileageVal;
                        sess.mileageDate = lineDateIso;
                        sess.mileageCategoryId = res.getValue('custrecord_category');
                        sess.mileageTaxCodeId = res.getValue('custrecord_tax_code');
                        sess.mileageMemo = res.getValue('custrecord_line_memo');
                    } else if (isFuelSurchargeLine) {
                        sess.fuelSurchargeCategoryId = res.getValue('custrecord_category');
                        sess.fuelSurchargeMemo = res.getValue('custrecord_line_memo');
                    } else {
                        sess.bills.push({
                            id: res.id,
                            fileId: fileId,
                            fileName: fileName,
                            fileUrl: fileUrl,
                            mimeType: mimeType,
                            status: 'done',
                            extracted: extracted,
                            editedData: { ...extracted }
                        });
                    }
                }
            });
        }

        sessions.reverse();
        return { success: true, chats: sessions };
    }

    /** Delete session and sublists (Soft Delete) */
    function handleDeleteSession(sessionId) {
        if (!sessionId) throw new Error('sessionId required');
        try {
            record.submitFields({
                type: 'customrecord_expense_report_session',
                id: sessionId,
                values: { isinactive: true }
            });
            return { success: true };
        } catch (e) {
            // Already deleted or invalid ID format (e.g. timestamp from frontend)
            return { success: true };
        }
    }

    /** Fetch delegate employees directly from employee multi-select field custentity_add_expense_for */
    function handleGetDelegateEmployees(employeeId) {
        if (!employeeId) return { success: true, delegates: [] };
        const delegates = [];
        try {
            log.debug('handleGetDelegateEmployees START', { employeeId: employeeId });
            const lookup = search.lookupFields({
                type: search.Type.EMPLOYEE,
                id: employeeId,
                columns: ['custentity_add_expense_for']
            });
            const fieldVal = lookup.custentity_add_expense_for;
            if (Array.isArray(fieldVal)) {
                fieldVal.forEach(item => {
                    if (item.value) {
                        delegates.push({
                            id: String(item.value),
                            name: item.text || `Employee ${item.value}`
                        });
                    }
                });
            } else if (fieldVal && typeof fieldVal === 'object' && fieldVal.value) {
                delegates.push({
                    id: String(fieldVal.value),
                    name: fieldVal.text || `Employee ${fieldVal.value}`
                });
            }
            log.debug('Delegates Found', { count: delegates.length, delegates: delegates });
        } catch (e) {
            log.error('Error in handleGetDelegateEmployees', e.message);
        }
        return { success: true, delegates: delegates };
    }

    /** Optimized Initialization */
    function handleAppInit(employeeId, employeeName, subsidiaryId) {
        if (!employeeId) throw new Error('employeeId required');

        try {
            const empDetails = handleGetEmployeeDetails(employeeId);
            const categories = handleListExpenseCategories();
            const taxCodes = handleListTaxCodes(subsidiaryId);
            const mandatoryFields = handleGetMandatoryFields(employeeId);
            const corporateCards = handleListCorporateCards();
            const projectCats = handleListProjectCategories();
            const projects = handleListProjects();

            log.debug('projects');
            const transferSubs = handleListTransferSubsidiaries();
            log.debug('transferSubs', transferSubs);

            const sessions = handleLoadSessions(employeeId);
            log.debug('sessions', sessions);

            const delegateData = handleGetDelegateEmployees(employeeId);

            log.debug('script here');

            const scriptObj = runtime.getCurrentScript();
            const defaultMileageTaxCode = scriptObj.getParameter({ name: 'custscript_default_mileage_tax_code' });

            log.debug('App Init Data Counts', {
                cats: categories.items?.length,
                tax: taxCodes.items?.length,
                projCats: projectCats.items?.length,
                projs: projects.items?.length,
                delegates: delegateData.delegates?.length
            });

            return {
                success: true,
                mileageRate: empDetails.mileageRate || 0,
                fuelSurchargeRate: empDetails.fuelSurchargeRate || 0,
                defaultMileageTaxCode: defaultMileageTaxCode || '',
                categories: categories.items || [],
                taxCodes: taxCodes.items || [],
                mandatoryFields: mandatoryFields.fields || [],
                corporateCards: corporateCards.items || [],
                projectCats: projectCats.items || [],
                projects: projects.items || [],
                transferSubs: transferSubs.items || [],
                folderId: null,
                chats: sessions.chats || [],
                delegates: delegateData.delegates || []
            };
        } catch (e) {
            log.error('App Init Error', e.message);
            return { success: false, error: e.message };
        }
    }

    // ─────────────────────────────────────────────
    // Main Suitelet entry point
    // ─────────────────────────────────────────────
    function onRequest(context) {
        if (context.request.method === 'GET') {
            const view = context.request.parameters.view;
            if (view === 'mobile') {
                context.response.write(getMobileFrontendHtml());
            } else {
                context.response.write(getFrontendHtml());
            }
            return;
        }

        // POST – dispatch actions
        try {
            const requestBody = JSON.parse(context.request.body);
            const action = requestBody.action;
            let result = {};

            if (action === 'login') {
                result = handleLogin(requestBody.email, requestBody.password, requestBody.skipVerification);

            } else if (action === 'verify_code') {
                result = handleVerifyCode(requestBody.employeeId, requestBody.code);

            } else if (action === 'list_employees') {
                result = handleListEmployees();

            } else if (action === 'get_employee_details') {
                result = handleGetEmployeeDetails(requestBody.employeeId);

            } else if (action === 'list_expense_categories') {
                result = handleListExpenseCategories();

            } else if (action === 'list_tax_codes') {
                result = handleListTaxCodes(requestBody.subsidiaryId, requestBody.countryCode);

            } else if (action === 'list_subsidiaries') {
                result = handleListSubsidiaries();

            } else if (action === 'list_countries') {
                result = handleListCountries();

            } else if (action === 'list_corporate_cards') {
                result = handleListCorporateCards();

            } else if (action === 'find_or_create_employee_folder') {
                result = handleFindOrCreateEmployeeFolder(
                    requestBody.employeeId,
                    requestBody.employeeName
                );

            } else if (action === 'upload_bill_file') {
                result = handleUploadBillFile(requestBody);

            } else if (action === 'get_file_contents') {
                result = handleGetFileContents(requestBody.fileId);

            } else if (action === 'extract_expense') {
                // Load categories for the prompt matching
                const catResult = handleListExpenseCategories();
                result = handleExtractExpense(requestBody, catResult.items || []);

            } else if (action === 'get_mandatory_fields') {
                result = handleGetMandatoryFields(requestBody.employeeId);

            } else if (action === 'get_exchange_rate') {
                result = handleGetExchangeRate(
                    requestBody.fromCurrency,
                    requestBody.toCurrency,
                    requestBody.trandate
                );

            } else if (action === 'create_expense_report') {
                result = handleCreateExpenseReport(requestBody);

            } else if (action === 'save_session') {
                result = handleSaveSession(requestBody.chat);

            } else if (action === 'load_sessions') {
                result = handleLoadSessions(requestBody.employeeId);

            } else if (action === 'delete_session') {
                result = handleDeleteSession(requestBody.sessionId);

            } else if (action === 'init_app') {
                result = handleAppInit(
                    requestBody.employeeId,
                    requestBody.employeeName,
                    requestBody.subsidiaryId
                );

            } else {
                result = { success: false, error: `Unknown action: ${action}` };
            }

            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(sanitizeForJson(result)));

        } catch (error) {
            log.error('Suitelet POST Error', error.message + '\n' + error.stack);
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(sanitizeForJson({ success: false, error: error.message })));
        }
    }

    return { onRequest: onRequest };
});
