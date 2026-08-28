/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/ui/dialog', 'N/search'], (dialog, search) => {

    const FIELD_SHIPPING_CHARGE = 'custbody_tc_shipping_charge';
    const FIELD_VENDOR_FREIGHT = 'custbody_ts_vendor_freight';
    const FIELD_SUBSIDIARY = 'subsidiary';
    const FIELD_PO_SUBSIDIARY = 'custbody_po_subsidiary';
    const FIELD_PO_ITEM = 'custbody_tc_po_item';

    // Customer/Vendor freight currency fields
    const FIELD_CUSTOMER_FREIGHT = 'custbody_ts_customer_freight';
    const FIELD_CUSTOMER_FREIGHT_CURRENCY = 'custbodycustbody_tc_cust_fr_currency';
    const FIELD_VENDOR_FREIGHT_CURRENCY = 'custbodycustbody_vendor_fr_currency';
    const FIELD_CARRIER_VENDOR = 'custbody_tc_carrier';
    const FIELD_CUSTOMER = 'custbody_tc_customer';

    // helper custom fields
    const FIELD_FLAG_FREIGHT_CHANGED = 'custbody_csr_freight_changed';
    const FIELD_FLAG_PO_ITEM_CHANGED = 'custbody_csr_po_item_changed';
    const FIELD_FLAG_SHIPPING_CHARGE_CHANGED = 'custbody_csr_shipping_charge_changed';
    const FIELD_ORIG_FREIGHT = 'custbody_csr_original_vendor_freight';
    const FIELD_ORIG_PO_ITEM = 'custbody_csr_original_po_item';

    // PO status fields
    // const FIELD_ORDER_STATUS = 'status';
    // const FIELD_STATUS_TEXT = 'statusRef';

    const SHIPPING_PICKUP_VALUE = 1;

    let lastWarningKey = '';
    let isDialogOpen = false;
    let vendorFrieghtAmount = 0; // Stores page-load Vendor Freight value.
    let poItem = ''; // Stores page-load header PO Item value.
    let isReverting = false; // Prevents reset logic from triggering fieldChanged.

    function hasVendorFreightValue(value) {
        return value !== '' &&
            value !== null &&
            value !== undefined &&
            Number(value) > 0;
    }

    function hasAmount(value) {
        const result = value !== '' && value !== null && value !== undefined && Number(value) > 0;
        console.debug('hasAmount | value=' + value + ' | result=' + result);
        return result;
    }

    function normalizeValue(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        return String(value);
    }

    function normalizeNumber(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        return String(Number(value));
    }

    function getPrimaryCurrency(recordType, recordId) {
        if (!recordId) {
            console.debug('getPrimaryCurrency | recordType=' + recordType + ' | recordId empty | currency=');
            return '';
        }

        try {
            const result = search.lookupFields({
                type: recordType,
                id: recordId,
                columns: ['currency']
            });

            let currencyId = '';

            if (result.currency && Array.isArray(result.currency) && result.currency.length > 0) {
                currencyId = result.currency[0].value || '';
            }

            console.debug('getPrimaryCurrency | recordType=' + recordType + ' | recordId=' + recordId + ' | currency=' + currencyId);
            return currencyId;

        } catch (e) {
            console.error('getPrimaryCurrency error | recordType=' + recordType + ' | recordId=' + recordId + ' | msg=' + e.message);
            return '';
        }
    }

    function autoPopulateFreightCurrency(rec, type) {
        try {
            const isCustomer = type === 'customer';
            const amountField = isCustomer ? FIELD_CUSTOMER_FREIGHT : FIELD_VENDOR_FREIGHT;
            const sourceField = isCustomer ? FIELD_CUSTOMER : FIELD_CARRIER_VENDOR;
            const currencyField = isCustomer ? FIELD_CUSTOMER_FREIGHT_CURRENCY : FIELD_VENDOR_FREIGHT_CURRENCY;
            const recordType = isCustomer ? search.Type.CUSTOMER : search.Type.VENDOR;

            const amount = rec.getValue({ fieldId: amountField });
            if (!hasAmount(amount)) return;

            const sourceId = rec.getValue({ fieldId: sourceField });
            const currencyId = getPrimaryCurrency(recordType, sourceId);

            console.debug('autoPopulateFreightCurrency | type=' + type + ' | amount=' + amount + ' | sourceId=' + sourceId + ' | currency=' + currencyId);

            if (currencyId) {
                rec.setValue({
                    fieldId: currencyField,
                    value: currencyId,
                    ignoreFieldChanged: true
                });
            }

        } catch (e) {
            console.error('autoPopulateFreightCurrency error | type=' + type + ' | msg=' + e.message);
        }
    }

    function validateFreightCurrencies(rec) {
        const customerFreight = rec.getValue({ fieldId: FIELD_CUSTOMER_FREIGHT });
        const customerCurrency = rec.getValue({ fieldId: FIELD_CUSTOMER_FREIGHT_CURRENCY });

        console.debug('validateFreightCurrencies | customerFreight=' + customerFreight + ' | customerCurrency=' + customerCurrency);

        if (hasAmount(customerFreight) && !customerCurrency) {
            alert('Customer Freight Currency is mandatory when Customer Freight amount is populated.');
            return false;
        }

        const vendorFreight = rec.getValue({ fieldId: FIELD_VENDOR_FREIGHT });
        const vendorCurrency = rec.getValue({ fieldId: FIELD_VENDOR_FREIGHT_CURRENCY });

        console.debug('validateFreightCurrencies | vendorFreight=' + vendorFreight + ' | vendorCurrency=' + vendorCurrency);

        if (hasAmount(vendorFreight) && !vendorCurrency) {
            alert('Vendor Freight Currency is mandatory when Vendor Freight amount is populated.');
            return false;
        }

        return true;
    }

    function isPOBilled(rec) {
        try {

            const poId = rec.getValue({
                fieldId: 'custbody_ds_freight_purchase_order'
            });

            if (!poId) {
                return false;
            }

            // Lookup PO status
            const poFields = search.lookupFields({
                type: search.Type.PURCHASE_ORDER,
                id: poId,
                columns: ['statusRef']
            });

            let statusText = '';

            if (poFields.statusRef) {
                if (Array.isArray(poFields.statusRef) && poFields.statusRef.length > 0) {
                    statusText = poFields.statusRef[0].text || '';
                } else {
                    statusText = poFields.statusRef;
                }
            }

            statusText = normalizeValue(statusText).toLowerCase();

            var isBilled = statusText.indexOf('billed') !== -1;

            log.debug('isPOBilled', 'poId : ' + poId + ' -- statusText : ' + statusText + ' -- isBilled : ' + isBilled);
            console.debug('isPOBilled', 'poId : ' + poId + ' -- statusText : ' + statusText + ' -- isBilled : ' + isBilled);

            return isBilled;

        } catch (e) {
            log.error('isPOBilled error', e);
            return false;
        }
    }

    function getShippingValidationResult(rec) {
        const shippingCharge = rec.getValue({
            fieldId: FIELD_SHIPPING_CHARGE
        });

        const vendorFreight = rec.getValue({
            fieldId: FIELD_VENDOR_FREIGHT
        });

        const hasVendorFreight = hasVendorFreightValue(vendorFreight);

        if (Number(shippingCharge) === SHIPPING_PICKUP_VALUE && hasVendorFreight) {
            return {
                showWarning: true,
                warningKey: 'PICKUP_WITH_VENDOR_FREIGHT',
                message: 'Are you sure a PO needs to be created for this Vendor? Please review the shipping charge method.'
            };
        }

        if (Number(shippingCharge) !== SHIPPING_PICKUP_VALUE && !hasVendorFreight) {
            return {
                showWarning: true,
                warningKey: 'NON_PICKUP_WITHOUT_VENDOR_FREIGHT',
                message: 'Are you sure a PO does NOT need to be created for this Vendor? Please review the vendor freight charge.'
            };
        }

        return {
            showWarning: false,
            warningKey: '',
            message: ''
        };
    }

    function showWarningModal(messageText) {
        if (isDialogOpen) {
            return;
        }

        isDialogOpen = true;

        dialog.alert({
            title: 'Warning',
            message: messageText
        }).then(() => {
            isDialogOpen = false;
        }).catch((e) => {
            isDialogOpen = false;
            console.debug('showWarningModal error: ' + e.message);
        });
    }

    //added by sim 24-07 
    function updateVendorFreightMandatoryFields(rec) {
        try {
            // Get the current Vendor Freight amount.
            const vendorFreight = rec.getValue({ fieldId: FIELD_VENDOR_FREIGHT });

            // Make fields mandatory only when Vendor Freight is greater than zero.
            const isMandatory = hasVendorFreightValue(vendorFreight);

            // Get PO Item, PO Subsidiary and Carrier fields.
            const poItemField = rec.getField({ fieldId: FIELD_PO_ITEM });
            const poSubsidiaryField = rec.getField({ fieldId: FIELD_PO_SUBSIDIARY });
            const carrierField = rec.getField({ fieldId: FIELD_CARRIER_VENDOR });

            // Update mandatory status of all three fields.
            if (poItemField) poItemField.isMandatory = isMandatory;
            if (poSubsidiaryField) poSubsidiaryField.isMandatory = isMandatory;
            if (carrierField) carrierField.isMandatory = isMandatory;

            console.debug('updateVendorFreightMandatoryFields | vendorFreight=' + vendorFreight + ' | isMandatory=' + isMandatory);

        } catch (e) {
            console.error('updateVendorFreightMandatoryFields error: ' + e.message);
        }
    }

    function pageInit(context) {
        try {
            const rec = context.currentRecord;

            vendorFrieghtAmount = rec.getValue({ fieldId: FIELD_VENDOR_FREIGHT });
            poItem = rec.getValue({ fieldId: FIELD_PO_ITEM });

            // Set mandatory status based on the existing Vendor Freight amount. 
            updateVendorFreightMandatoryFields(rec); //added by sim 24-07 

            // only initialize once
            const origFreight = rec.getValue({ fieldId: FIELD_ORIG_FREIGHT });
            if (origFreight === '' || origFreight === null || origFreight === undefined) {
                rec.setValue({
                    fieldId: FIELD_ORIG_FREIGHT,
                    value: normalizeNumber(rec.getValue({ fieldId: FIELD_VENDOR_FREIGHT })),
                    ignoreFieldChanged: true
                });
            }

            const origPOItem = rec.getValue({ fieldId: FIELD_ORIG_PO_ITEM });
            if (origPOItem === '' || origPOItem === null || origPOItem === undefined) {
                rec.setValue({
                    fieldId: FIELD_ORIG_PO_ITEM,
                    value: normalizeValue(rec.getValue({ fieldId: FIELD_PO_ITEM })),
                    ignoreFieldChanged: true
                });
            }

            rec.setValue({
                fieldId: FIELD_FLAG_FREIGHT_CHANGED,
                value: false,
                ignoreFieldChanged: true
            });

            rec.setValue({
                fieldId: FIELD_FLAG_PO_ITEM_CHANGED,
                value: false,
                ignoreFieldChanged: true
            });

        } catch (e) {
            console.error('pageInit error: ' + e.message);
        }
    }

    function validateField(context) {
        try {
            const rec = context.currentRecord;
            const fieldId = context.fieldId;
            const sublistId = context.sublistId;

            // Skip validation for script-driven resets.
            if (isReverting) {
                return true;
            }

            // Check if line-level PO Item is being changed.
            const isLinePOItem =
                sublistId === 'line' &&
                fieldId === 'custcol_csr_po_item';

            // Check if header Vendor Freight is being changed.
            const isHeaderVendorFreight =
                !sublistId &&
                fieldId === FIELD_VENDOR_FREIGHT;

            // Check if header PO Item is being changed.
            const isHeaderPOItem =
                !sublistId &&
                fieldId === FIELD_PO_ITEM;

            // Only block these fields when linked PO is billed.
            if (isLinePOItem || isHeaderVendorFreight || isHeaderPOItem) {

                // Stop edits if linked Freight PO is already billed.
                if (isPOBilled(rec)) {

                    alert('PO is already billed. Freight Amount and PO Item cannot be modified now.');

                    // Block line-level PO Item change.
                    if (isLinePOItem) {
                        return false;
                    }

                    // Reset Vendor Freight back to page-load value.
                    if (isHeaderVendorFreight) {
                        isReverting = true;

                        rec.setValue({
                            fieldId: FIELD_VENDOR_FREIGHT,
                            value: vendorFrieghtAmount ? Number(vendorFrieghtAmount) : '',
                            ignoreFieldChanged: true
                        });

                        // Clear revert flag after NetSuite finishes field handling.
                        setTimeout(() => {
                            isReverting = false;
                        }, 100);

                        return true;
                    }

                    // Reset header PO Item back to page-load value.
                    if (isHeaderPOItem) {
                        isReverting = true;

                        rec.setValue({
                            fieldId: FIELD_PO_ITEM,
                            value: poItem || '',
                            ignoreFieldChanged: true
                        });

                        // Clear revert flag after NetSuite finishes field handling.
                        setTimeout(() => {
                            isReverting = false;
                        }, 100);

                        return true;
                    }
                }
            }

            // Allow all other field changes.
            return true;

        } catch (e) {
            console.error('validateField error: ' + e.message);

            // Clear reset flag on error.
            isReverting = false;

            // Do not block user unexpectedly.
            return true;
        }
    }

    // let isReverting = false;
    function fieldChanged(context) {
        try {
            // if (isReverting) return;
            const rec = context.currentRecord;
            const fieldId = context.fieldId;

            // Skip fieldChanged after script-driven reset.
            if (isReverting) {
                isReverting = false;
                return;
            }

            // Line PO Item tracking
            if (context.sublistId === 'line' && fieldId === 'custcol_csr_po_item') {
                console.debug('Line PO Item changed | line=' + context.line);
                rec.setValue({
                    fieldId: FIELD_FLAG_PO_ITEM_CHANGED,
                    value: true,
                    ignoreFieldChanged: true
                });
                return;
            }

            if (fieldId !== FIELD_SHIPPING_CHARGE &&
                fieldId !== FIELD_VENDOR_FREIGHT &&
                fieldId !== FIELD_PO_ITEM &&
                fieldId !== FIELD_CUSTOMER_FREIGHT &&
                fieldId !== FIELD_CUSTOMER &&
                fieldId !== FIELD_CARRIER_VENDOR) {
                return;
            }

            console.debug('fieldChanged fired: ' + fieldId);

            if (fieldId === FIELD_CUSTOMER_FREIGHT || fieldId === FIELD_CUSTOMER) {
                autoPopulateFreightCurrency(rec, 'customer');
            }

            if (fieldId === FIELD_VENDOR_FREIGHT || fieldId === FIELD_CARRIER_VENDOR) {
                autoPopulateFreightCurrency(rec, 'vendor');
                // Vendor Freight controls whether PO Item and PO Subsidiary  and Carrier mandatory status. //added by sim 24-07 
                if (fieldId === FIELD_VENDOR_FREIGHT) {
                    updateVendorFreightMandatoryFields(rec);
                }
            }

            if (fieldId === FIELD_PO_ITEM) {
                // if (isPOBilled(rec)) {
                //     rec.setValue({
                //         fieldId: FIELD_PO_ITEM,
                //         value: poItem || '',
                //         ignoreFieldChanged: true
                //     });
                //     alert('PO is already billed. PO Item cannot be modified now.');
                //     return;
                // }
                const subsidiary = rec.getValue({ fieldId: FIELD_SUBSIDIARY });
                const poItemValue = rec.getValue({ fieldId: FIELD_PO_ITEM });
                const lineCount = rec.getLineCount({ sublistId: 'line' });

                // set PO Subsidiary (header level)
                rec.setValue({
                    fieldId: FIELD_PO_SUBSIDIARY,
                    value: subsidiary,
                    ignoreFieldChanged: true
                });

                // set line level field value for PO Item
                for (let i = 0; i < lineCount; i++) {
                    rec.selectLine({ sublistId: 'line', line: i });
                    rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_csr_po_item', value: poItemValue || '', ignoreFieldChange: true });
                    rec.commitLine({ sublistId: 'line' });
                    // rec.setSublistValue({ sublistId: 'item', fieldId: 'custcol_csr_po_item', line: i, value: poItemValue || '' });
                }
            }

            // block modifications if PO is billed
            // if ((fieldId === FIELD_VENDOR_FREIGHT || fieldId === FIELD_PO_ITEM) && isPOBilled(rec)) {
            //     alert('PO is already billed. Freight Amount and PO Item cannot be modified now.');
            //     // isReverting = true;
            //     if (fieldId === FIELD_VENDOR_FREIGHT) {
            //         // const origFreight = rec.getValue({ fieldId: FIELD_ORIG_FREIGHT });
            //         // rec.setValue({
            //         //     fieldId: FIELD_VENDOR_FREIGHT,
            //         //     value: origFreight ? Number(origFreight) : '',
            //         //     ignoreFieldChanged: true
            //         // });
            //         rec.setValue({
            //             fieldId: FIELD_VENDOR_FREIGHT,
            //             value: vendorFrieghtAmount,
            //             ignoreFieldChanged: true
            //         });
            //     }

            //     if (fieldId === FIELD_PO_ITEM) {
            //         // const origPOItem = rec.getValue({ fieldId: FIELD_ORIG_PO_ITEM });
            //         // rec.setValue({
            //         //     fieldId: FIELD_PO_ITEM,
            //         //     value: origPOItem || '',
            //         //     ignoreFieldChanged: true
            //         // });
            //         rec.setValue({
            //             fieldId: FIELD_PO_ITEM,
            //             value: poItem || '',
            //             ignoreFieldChanged: true
            //         });
            //     }
            //     // isReverting = false;
            //     return;
            // }

            // set change flags
            if (fieldId === FIELD_VENDOR_FREIGHT) {
                const origFreight = normalizeNumber(rec.getValue({ fieldId: FIELD_ORIG_FREIGHT }));
                const currFreight = normalizeNumber(rec.getValue({ fieldId: FIELD_VENDOR_FREIGHT }));

                rec.setValue({
                    fieldId: FIELD_FLAG_FREIGHT_CHANGED,
                    value: origFreight !== currFreight,
                    ignoreFieldChanged: true
                });
            }

            if (fieldId === FIELD_PO_ITEM) {
                const origPOItem = normalizeValue(rec.getValue({ fieldId: FIELD_ORIG_PO_ITEM }));
                const currPOItem = normalizeValue(rec.getValue({ fieldId: FIELD_PO_ITEM }));

                rec.setValue({
                    fieldId: FIELD_FLAG_PO_ITEM_CHANGED,
                    value: origPOItem !== currPOItem,
                    ignoreFieldChanged: true
                });
            }

            if (fieldId === FIELD_SHIPPING_CHARGE) {
                rec.setValue({
                    fieldId: FIELD_FLAG_SHIPPING_CHARGE_CHANGED,
                    value: true,
                    ignoreFieldChanged: true
                });
            }
            // keep your existing warning logic
            if (fieldId === FIELD_PO_ITEM || fieldId === FIELD_CUSTOMER_FREIGHT || fieldId === FIELD_CUSTOMER || fieldId === FIELD_CARRIER_VENDOR) {
                return;
            }

            const result = getShippingValidationResult(rec);

            if (!result.showWarning) {
                lastWarningKey = '';
                return;
            }

            if (lastWarningKey !== result.warningKey) {
                lastWarningKey = result.warningKey;
                showWarningModal(result.message);
            }

        } catch (e) {
            console.error('fieldChanged error: ' + e.message);
        }
    }

    //added by sim 28-07 
    // even after making fields mandatory in client script, NS does not validate the fields on clcik of save()
    // so we have to add this new function which is called in SaveRecord() for correct validation.
    function validateVendorFreightFields(rec) {
        // Get Vendor Freight amount.
        const vendorFreight = rec.getValue({ fieldId: FIELD_VENDOR_FREIGHT });

        // No validation when Vendor Freight is blank or zero.
        if (!hasVendorFreightValue(vendorFreight)) return true;

        // Collect missing required fields.
        const missingFields = [];

        if (!rec.getValue({ fieldId: FIELD_PO_ITEM })) missingFields.push('PO Item');
        if (!rec.getValue({ fieldId: FIELD_PO_SUBSIDIARY })) missingFields.push('PO Subsidiary');
        if (!rec.getValue({ fieldId: FIELD_CARRIER_VENDOR })) missingFields.push('Carrier Vendor');

        // Stop save and show all missing fields at once.
        if (missingFields.length > 0) {
            alert(
                'The following fields are mandatory when Vendor Freight has an amount:\n\n' +
                '- ' + missingFields.join('\n- ')
            );
            return false;
        }

        return true;
    }
    function saveRecord(context) {
        try {
            const rec = context.currentRecord;

            /** Got feedback user unable to change, so commenting this code in saveRecord() */
            // autoPopulateFreightCurrency(rec, 'customer');
            // autoPopulateFreightCurrency(rec, 'vendor');

            // Validate freight currencies.
            if (!validateFreightCurrencies(rec))
                return false;

            // Validate required PO fields when Vendor Freight has amount.
            if (!validateVendorFreightFields(rec))
                return false;

            const result = getShippingValidationResult(rec);

            if (result.showWarning) {
                const userResponse = confirm(
                    result.message + '\n\nClick OK to proceed Save or Cancel to review.'
                );
                return !!userResponse;
            }

            return true;

        } catch (e) {
            console.error('saveRecord error: ' + e.message);
            return true;
        }
    }

    return {
        pageInit: pageInit,
        validateField: validateField,
        fieldChanged: fieldChanged,
        saveRecord: saveRecord
    };
});