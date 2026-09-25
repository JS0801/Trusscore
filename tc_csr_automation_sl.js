/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/search', 'N/record', 'N/file', 'N/log', 'N/runtime', 'N/format', 'N/query'], (search, record, file, log, runtime, format, query) => {

    const HTML_FILE_ID = '2595176';

    const parseClientDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                return format.format({ value: dateObj, type: format.Type.DATE });
            }
        } catch (e) {
            log.error('Error parsing client date: ' + dateStr, e);
        }
        return dateStr;
    };

    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            try {
                // Try to load the HTML file from the File Cabinet to render the UI
                let htmlFileId = runtime.getCurrentScript().getParameter({ name: 'custscript_ui_file_id' });
                if (!htmlFileId) {
                    htmlFileId = HTML_FILE_ID;
                }
                const htmlFile = file.load({ id: htmlFileId });
                let htmlContent = htmlFile.getContents();

                // Get current user location and inject into HTML
                const userLocation = runtime.getCurrentUser().location;
                htmlContent = htmlContent.replace('{{{USER_LOCATION}}}', userLocation || '');

                context.response.write(htmlContent);
            } catch (e) {
                log.error('HTML File Load Error', `Ensure UI file ID is correct. ${e.message}`);
                context.response.write(`<html><body><h2>Error loading UI</h2><p>Please update the <code>custscript_ui_file_id</code> script parameter or the fallback ID in the Suitelet code.</p><p>Error: ${e.message}</p></body></html>`);
            }
        } else if (context.request.method === 'POST') {
            let body;
            try {
                body = JSON.parse(context.request.body);
            } catch (e) {
                body = context.request.parameters;
            }

            const action = body.action;

            try {
                if (action === 'getData') {
                    const data = getCsrData(body.payload || {});
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: data }));
                } else if (action === 'getSoData') {
                    const data = getSalesOrderData(body.payload || {});
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: data }));
                } else if (action === 'fulfillLine') {
                    const result = fulfillLine(body.payload);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: result }));
                } else if (action === 'fulfillCsr') {
                    const result = fulfillCsr(body.payload);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: result }));
                } else if (action === 'getPickTasks') {
                    const data = getPickTasks();
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: data }));
                } else if (action === 'getFilterOptions') {
                    const data = getFilterOptions(body.payload || {});
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: data }));
                } else if (action === 'getInventoryDetails') {
                    const data = getInventoryDetails(body.payload);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: data }));
                } else if (action === 'getLotDetails') {
                    const data = getLotNumbersByItem(body.payload);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: data }));
                } else if (action === 'getChildInventoryDetails') {
                    const data = getChildInventoryDetails(body.payload.csrPickTaskId);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify({ success: true, data: data }));
                } else if (action === 'updateChildInventory') {
                    const result = updateChildInventory(body.payload);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify(result));
                } else if (action === 'deleteChildInventory') {
                    const result = deleteChildInventory(body.payload);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify(result));
                } else if (action === 'createItemFulfillment') {
                    const data = createItemFulfillment(body.payload);
                    context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                    context.response.write(JSON.stringify(data));
                } else {
                    context.response.write(JSON.stringify({ success: false, error: 'Unknown Action: ' + action }));
                }
            } catch (e) {
                log.error('API Action Error', e);
                context.response.write(JSON.stringify({ success: false, error: e.message }));
            }
        }
    };

    const getSubsidiaryLocationIds = () => {
        const user = runtime.getCurrentUser();
        const userSubsidiary = user.subsidiary;
        const isAdmin = user.role === 3;

        if (!userSubsidiary && !isAdmin) return [];

        const locations = [];
        const filters = [
            ["isinactive", "is", "F"]
        ];

        if (!isAdmin && userSubsidiary) {
            filters.push("AND", ["subsidiary", "anyof", userSubsidiary]);
        }

        search.create({
            type: "location",
            filters: filters,
            columns: ["internalid"]
        }).run().each(r => {
            locations.push(r.id);
            return true;
        });
        return locations;
    };

    const getSalesOrderData = (params) => {
        try {
            const { pageIndex = 0, filters = {} } = params;
            log.debug('getSalesOrderData Params', params);

            let sqlUnique = `
                SELECT DISTINCT 
                    so.id AS so_id 
                FROM 
                    transaction AS so
                JOIN 
                    transactionline AS soline ON soline.transaction = so.id
                JOIN
                    item ON item.id = soline.item
                WHERE 
                    so.type = 'SalesOrd'
                    AND soline.mainline = 'F'
                    AND soline.taxline = 'F'
                    AND soline.shipping = 'F'
                    AND so.status IN ('SalesOrd:A', 'SalesOrd:B', 'SalesOrd:D', 'SalesOrd:E', 'SalesOrd:F')
            `;
            const sqlParams = [];

            const user = runtime.getCurrentUser();
            const userSubsidiary = user.subsidiary;
            const isAdmin = user.role === 3;

            if (userSubsidiary && !isAdmin) {
                sqlUnique += " AND so.subsidiary = ?";
                sqlParams.push(userSubsidiary);
            }

            if (filters.so && filters.so.trim()) {
                sqlUnique += " AND UPPER(so.tranid) LIKE UPPER(?)";
                sqlParams.push(`%${filters.so.trim()}%`);
            }
            if (filters.customerId) {
                sqlUnique += " AND so.custbody_tc_to_customer = ?";
                sqlParams.push(filters.customerId);
            }
            if (filters.locationId) {
                sqlUnique += " AND soline.location = ?";
                sqlParams.push(filters.locationId);
            } else {
                const subLocs = getSubsidiaryLocationIds();
                if (subLocs.length > 0) {
                    sqlUnique += " AND soline.location IN (" + subLocs.map(() => "?").join(",") + ")";
                    subLocs.forEach(id => sqlParams.push(id));
                }
            }
            if (filters.startDate) {
                sqlUnique += " AND so.trandate >= TO_DATE(?, 'YYYY-MM-DD')";
                sqlParams.push(filters.startDate);
            }
            if (filters.endDate) {
                sqlUnique += " AND so.trandate <= TO_DATE(?, 'YYYY-MM-DD')";
                sqlParams.push(filters.endDate);
            }

            sqlUnique += " ORDER BY so.id DESC";

            const allSoIds = [];
            query.runSuiteQL({ query: sqlUnique, params: sqlParams }).asMappedResults().forEach(res => {
                allSoIds.push(res.so_id);
            });

            const totalCount = allSoIds.length;
            const pageSize = 20;
            const totalPages = Math.ceil(totalCount / pageSize);
            const pageSoIds = allSoIds.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

            const results = [];

            if (pageSoIds.length > 0) {
                let sqlDetails = `
                    SELECT 
                        so.id AS so_id,
                        so.tranid AS tranid,
                        BUILTIN.DF(so.custbody_tc_to_customer) AS customer,
                        BUILTIN.DF(soline.item) AS item,
                        soline.item AS item_id,
                        soline.quantity AS quantity,
                        soline.quantityallocated AS quantityallocated,
                        soline.quantitycommitted AS quantitycommitted,
                        soline.quantityshiprecv AS quantityshiprecv,
                        BUILTIN.DF(so.status) AS status,
                        soline.lineuniquekey AS lineuniquekey,
                        soline.line AS line_id,
                        so.trandate AS ship_date,
                        BUILTIN.DF(soline.location) AS ship_loc
                    FROM 
                        transaction AS so
                    JOIN 
                        transactionline AS soline ON soline.transaction = so.id
                    WHERE 
                        so.id IN (${pageSoIds.map(() => "?").join(",")})
                        AND soline.mainline = 'F'
                        AND soline.taxline = 'F'
                        AND soline.shipping = 'F'
                `;

                const detailParams = [...pageSoIds];

                query.runSuiteQL({ query: sqlDetails, params: detailParams }).asMappedResults().forEach(r => {
                    results.push({
                        id: r.so_id,
                        tranid: r.tranid,
                        customer: r.customer,
                        item: r.item,
                        itemId: r.item_id,
                        quantity: r.quantity,
                        quantityAllocated: r.quantityallocated,
                        quantityCommitted: r.quantitycommitted,
                        quantityShipRecv: r.quantityshiprecv,
                        status: r.status,
                        lineUniqueKey: r.lineuniquekey,
                        lineId: r.line_id,
                        shipDate: r.ship_date,
                        shipLoc: r.ship_loc,
                        salesOrderId: r.so_id,
                        listName: `${r.tranid} - ${r.item}`
                    });
                });
            }

            return {
                results: results,
                totalPages: totalPages,
                totalCount: totalCount,
                pageIndex: pageIndex
            };
        } catch (e) {
            log.error('Error in getSalesOrderData', e);
            throw e;
        }
    };

    const getCsrData = (params) => {
        try {
            const { pageIndex = 0, filters = {} } = params;
            log.debug('getCsrData Params', params);

            let sqlUnique = `
                SELECT DISTINCT 
                    pt.id AS pt_id 
                FROM customrecord_tc_csr_pick pt
                INNER JOIN Transaction csr
                    ON csr.id = pt.custrecord_tc_csr_pt_csr
                INNER JOIN TransactionLine csrline
                    ON csrline.transaction = csr.id
                   AND csrline.custcol_csr_pick_task_link = pt.id
                WHERE 
                    csr.custbody_ds_scrap_record = 'F'
            `;
            const sqlParams = [];

            const user = runtime.getCurrentUser();
            const userSubsidiary = user.subsidiary;
            const isAdmin = user.role === 3;

            if (userSubsidiary && !isAdmin) {
                sqlUnique += " AND csr.subsidiary = ?";
                sqlParams.push(userSubsidiary);
            }

            if (filters.csr && filters.csr.trim()) {
                sqlUnique += " AND UPPER(csr.tranid) LIKE UPPER(?)";
                sqlParams.push(`%${filters.csr.trim()}%`);
            }
            if (filters.startDate) {
                sqlUnique += " AND csr.custbody_tc_schedule_shipment_date >= TO_DATE(?, 'YYYY-MM-DD')";
                sqlParams.push(filters.startDate);
            }
            if (filters.endDate) {
                sqlUnique += " AND csr.custbody_tc_schedule_shipment_date <= TO_DATE(?, 'YYYY-MM-DD')";
                sqlParams.push(filters.endDate);
            }
            if (filters.item && filters.item.trim()) {
                sqlUnique += " AND UPPER(BUILTIN.DF(csrline.custcol_tc_item)) LIKE UPPER(?)";
                sqlParams.push(`%${filters.item.trim()}%`);
            }
            if (filters.locationId) {
                sqlUnique += " AND csr.custbody_tc_shipping_loc = ?";
                sqlParams.push(filters.locationId);
            } else {
                const subLocs = getSubsidiaryLocationIds();
                if (subLocs.length > 0) {
                    sqlUnique += " AND csr.custbody_tc_shipping_loc IN (" + subLocs.map(() => "?").join(",") + ")";
                    subLocs.forEach(id => sqlParams.push(id));
                }
            }
            if (filters.customerId) {
                sqlUnique += " AND csr.custbody_tc_customer = ?";
                sqlParams.push(filters.customerId);
            }

            sqlUnique += " ORDER BY pt.id DESC";

            // Run query to get all matching pick task IDs
            const allPtIds = [];
            query.runSuiteQL({ query: sqlUnique, params: sqlParams }).asMappedResults().forEach(res => {
                allPtIds.push(res.pt_id);
            });

            const totalCount = allPtIds.length;
            const pageSize = 50;
            const totalPages = Math.ceil(totalCount / pageSize);
            const pagePtIds = allPtIds.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

            const results = [];

            if (pagePtIds.length > 0) {
                // Get dynamic picked quantities
                const pickedQtyMap = {};
                try {
                    const pickedSearch = search.create({
                        type: 'customrecord_csr_pick_task_inventory_det',
                        filters: [
                            ['custrecord_csr_pick_task', 'anyof', pagePtIds]
                        ],
                        columns: [
                            search.createColumn({ name: 'custrecord_csr_pick_task', summary: search.Summary.GROUP }),
                            search.createColumn({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })
                        ]
                    });

                    pickedSearch.run().each(res => {
                        const ptId = res.getValue({ name: 'custrecord_csr_pick_task', summary: search.Summary.GROUP });
                        const sumQty = res.getValue({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM });
                        pickedQtyMap[ptId] = parseFloat(sumQty) || 0;
                        return true;
                    });
                } catch (searchErr) {
                    log.error('Error fetching dynamic picked quantities', searchErr);
                }

                // Query detail info for current page
                let sqlDetails = `
                    SELECT
                        pt.id AS pt_id,
                        BUILTIN.DF(pt.custrecord_tc_csr_pt_status) AS pt_status,
                        pt.custrecord_tc_csr_pt_csr AS csr_id,

                        csr.tranid,
                        BUILTIN.DF(csr.custbody_tc_customer) AS customer,
                        BUILTIN.DF(csr.custbody_tc_related_tran) AS related_tran,

                        csrline.custcol_tc_sales_order AS so_id,
                        BUILTIN.DF(csrline.custcol_tc_sales_order) AS sales_order,

                        csrline.custcol_tc_po_number AS po_number,
                        csrline.custcol_tc_supp_req_date AS supp_req_date,

                        csrline.custcol_tc_item AS item_id,
                        BUILTIN.DF(csrline.custcol_tc_item) AS item,

                        csrline.custcol_tc_item_qty AS quantity,
                        csrline.custcol_tc_qty_bo AS qty_bo,

                        csr.custbody_tc_schedule_shipment_date AS ship_date,
                        csr.custbody_tc_shipping_loc AS ship_loc_id,
                        BUILTIN.DF(csr.custbody_tc_shipping_loc) AS ship_loc,

                        csrline.custcol_tc_available AS qty_shipped,

                        pt.custrecord_tc_csr_pt_qty AS pick_qty,
                        csrline.custcol_tc_line_id AS line_id

                    FROM customrecord_tc_csr_pick pt

                    INNER JOIN Transaction csr
                        ON csr.id = pt.custrecord_tc_csr_pt_csr

                    INNER JOIN TransactionLine csrline
                        ON csrline.transaction = csr.id
                    AND csrline.custcol_csr_pick_task_link = pt.id

                    WHERE pt.id IN (${pagePtIds.map(() => "?").join(",")})
                `;

                const detailParams = [...pagePtIds];

                // For staging qty and SO status, we need Sales Order IDs
                const soIds = [];
                const detailResults = query.runSuiteQL({ query: sqlDetails, params: detailParams }).asMappedResults();

                detailResults.forEach(r => {
                    if (r.so_id && !soIds.includes(r.so_id)) {
                        soIds.push(r.so_id);
                    }
                });

                const stagingQtyMap = {};
                if (soIds.length > 0) {
                    try {
                        const stagingSearch = search.create({
                            type: 'salesorder',
                            filters: [
                                ['internalid', 'anyof', soIds],
                                'AND',
                                ['mainline', 'is', 'F'],
                                'AND',
                                ['taxline', 'is', 'F'],
                                'AND',
                                ['shipping', 'is', 'F'],
                                'AND',
                                ['inventorydetail.quantity', 'greaterthan', 0]
                            ],
                            columns: [
                                search.createColumn({ name: 'internalid', summary: search.Summary.GROUP }),
                                search.createColumn({ name: 'line', summary: search.Summary.GROUP }),
                                search.createColumn({ name: 'quantity', join: 'inventoryDetail', summary: search.Summary.SUM })
                            ]
                        });

                        stagingSearch.run().each(res => {
                            const foundSoId = res.getValue({ name: 'internalid', summary: search.Summary.GROUP });
                            const foundLineId = res.getValue({ name: 'line', summary: search.Summary.GROUP });
                            const qty = res.getValue({ name: 'quantity', join: 'inventoryDetail', summary: search.Summary.SUM });
                            stagingQtyMap[`${foundSoId}_${foundLineId}`] = parseFloat(qty) || 0;
                            return true;
                        });
                    } catch (searchErr) {
                        log.error('Error fetching dynamic staging quantities', searchErr);
                    }
                }

                const soStatusMap = {};
                if (soIds.length > 0) {
                    try {
                        const soStatusSearch = search.create({
                            type: 'salesorder',
                            filters: [
                                ['internalid', 'anyof', soIds],
                                'AND',
                                ['mainline', 'is', 'F'],
                                'AND',
                                ['taxline', 'is', 'F'],
                                'AND',
                                ['shipping', 'is', 'F']
                            ],
                            columns: ['internalid', 'line', 'quantityallocated', 'quantitycommitted']
                        });
                        soStatusSearch.run().each(res => {
                            const sid = res.getValue('internalid');
                            const lid = res.getValue('line');
                            soStatusMap[`${sid}_${lid}`] = {
                                allocated: res.getValue('quantityallocated') || 0,
                                committed: res.getValue('quantitycommitted') || 0
                            };
                            return true;
                        });
                    } catch (err) {
                        log.error('Error fetching SO status map', err);
                    }
                }

                const csrIdsForIf = [];
                detailResults.forEach(r => {
                    if (r.csr_id && !csrIdsForIf.includes(r.csr_id)) {
                        csrIdsForIf.push(r.csr_id);
                    }
                });

                const fulfilledCsrMap = {};
                if (csrIdsForIf.length > 0) {
                    try {
                        const itemfulfillmentSearchObj = search.create({
                            type: "itemfulfillment",
                            settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                            filters: [
                                ["type", "anyof", "ItemShip"],
                                "AND",
                                ["custcol_tc_related_shipping_record", "anyof", csrIdsForIf]
                            ],
                            columns: [
                                search.createColumn({ name: "custcol_tc_related_shipping_record" })
                            ]
                        });
                        itemfulfillmentSearchObj.run().each(res => {
                            const relatedCsrId = res.getValue("custcol_tc_related_shipping_record");
                            if (relatedCsrId) fulfilledCsrMap[relatedCsrId] = true;
                            return true;
                        });
                    } catch (err) {
                        log.error('Error checking IF existence', err);
                    }
                }

                detailResults.forEach(r => {
                    const lineId = r.pt_id;
                    const dynamicPickedQty = pickedQtyMap[lineId] || 0;
                    const soId = r.so_id;
                    const soLineId = r.line_id;
                    const dynamicStagingQty = stagingQtyMap[`${soId}_${soLineId}`] || 0;
                    const soStatus = soStatusMap[`${soId}_${soLineId}`] || { allocated: 0, committed: 0 };

                    results.push({
                        id: lineId,
                        csrId: r.csr_id,
                        status: r.pt_status,
                        tranid: r.tranid,
                        customer: r.customer,
                        relatedTran: r.related_tran,
                        salesOrder: r.sales_order,
                        salesOrderId: soId,
                        poNumber: r.po_number,
                        suppReqDate: r.supp_req_date,
                        item: r.item,
                        itemId: r.item_id,
                        quantity: r.quantity,
                        quantityAllocated: soStatus.allocated,
                        quantityCommitted: soStatus.committed,
                        quantityBackOrdered: r.qty_bo,
                        quantityBilled: 0,
                        quantityPicked: 0,
                        quantityPacked: 0,
                        quantityShipRecv: r.qty_shipped || 0,
                        lineId: soLineId,
                        lineUniqueKey: `${lineId}_${soLineId}`,
                        shipDate: r.ship_date,
                        shipLoc: r.ship_loc,
                        shipLocId: r.ship_loc_id,
                        qtyShipped: r.qty_shipped,
                        ptQty: r.pick_qty,
                        pickedQty: dynamicPickedQty,
                        stagingQty: dynamicStagingQty,
                        ifCreated: fulfilledCsrMap[r.csr_id] || false,
                        listName: `${r.tranid || ''} - ${r.item || ''}`
                    });
                });
            }

            return {
                results: results,
                totalPages: totalPages,
                totalCount: totalCount,
                pageIndex: pageIndex
            };
        } catch (e) {
            log.error('Error in getCsrData', e);
            throw e;
        }
    };

    /**
     * Processes fulfillment of a single line, and checks if SO is complete
     */
    const fulfillLine = (payload) => {
        const { csrId, lineId, lotNumber, itemId, quantity, salesOrderId, locationId } = payload;
        log.debug('fulfillLine New Design', payload);

        try {
            const lotInternalId = findLotInternalId(lotNumber, itemId);
            if (!lotInternalId) {
                throw new Error(`Inventory number '${lotNumber}' not found for this item.`);
            }

            // 1. Get total available from inventory number for the specific location
            var totalAvail = 0;
            var lotFilters = [['internalid', 'anyof', lotInternalId]];

            // If locationId was not passed, we can look it up from the Pick Task record
            let locId = locationId;
            if (!locId) {
                search.create({
                    type: 'customrecord_tc_csr_pick',
                    filters: [['internalid', 'anyof', csrId]],
                    columns: [
                        search.createColumn({
                            name: 'custbody_tc_shipping_loc',
                            join: 'custrecord_tc_csr_pt_csr'
                        })
                    ]
                }).run().each(res => {
                    locId = res.getValue({
                        name: 'custbody_tc_shipping_loc',
                        join: 'custrecord_tc_csr_pt_csr'
                    });
                    return false;
                });
            }

            if (locId) {
                lotFilters.push('AND', ['location', 'anyof', locId]);
            }

            var lotSearch = search.create({
                type: 'inventorynumber',
                filters: lotFilters,
                columns: ['quantityavailable']
            });
            lotSearch.run().each(res => {
                totalAvail = parseFloat(res.getValue('quantityavailable')) || 0;
                return false; // Stop after first match for the location
            });

            // 2. Get total picked/staged across all pick tasks for this lot at this location
            var totalPicked = 0;
            var pickedFilters = [['custrecord_lot_', 'anyof', lotInternalId]];

            if (locId) {
                // Multi-level joins like join1.join2.field are not supported in filters.
                // We'll find all Pick Tasks for this location first.
                const pickTaskIds = [];
                const locationPickTaskSearch = search.create({
                    type: 'customrecord_tc_csr_pick',
                    filters: [['custrecord_tc_csr_pt_csr.custbody_tc_shipping_loc', 'anyof', locId]],
                    columns: [search.createColumn({ name: 'internalid', sort: search.Sort.ASC })]
                });
                // ResultSet.each stops at 4,000 results. Read every page with a unique sort.
                const locationPickTaskPages = locationPickTaskSearch.runPaged({ pageSize: 1000 });
                locationPickTaskPages.pageRanges.forEach(pageRange => {
                    const page = locationPickTaskPages.fetch({ index: pageRange.index });
                    page.data.forEach(result => pickTaskIds.push(result.id));
                });

                if (pickTaskIds.length > 0) {
                    pickedFilters.push('AND', ['custrecord_csr_pick_task', 'anyof', pickTaskIds]);
                } else {
                    // If no pick tasks found for this location (unlikely), set a dummy filter to return 0
                    pickedFilters.push('AND', ['internalid', 'anyof', '@NONE@']);
                }
            }

            var pickedSearch = search.create({
                type: 'customrecord_csr_pick_task_inventory_det',
                filters: pickedFilters,
                columns: [
                    search.createColumn({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })
                ]
            });
            pickedSearch.run().each(res => {
                totalPicked = parseFloat(res.getValue({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })) || 0;
                return true;
            });

            var trueAvail = totalAvail - totalPicked;

            if (parseFloat(quantity) > trueAvail) {
                throw new Error(`Lot ${lotNumber} only has ${trueAvail} available at this location (Total: ${totalAvail}, Reserved: ${totalPicked}), but you requested ${quantity}.`);
            }

            // Create a NEW child record for inventory details
            const childRecord = record.create({
                type: 'customrecord_csr_pick_task_inventory_det'
            });
            const soStr = salesOrderId ? `_SO-${salesOrderId}` : '';
            const lineStr = lineId ? `_L-${lineId}` : '';
            childRecord.setValue({ fieldId: 'name', value: `PT-${csrId}${soStr}${lineStr}_D-${Date.now()}` });
            childRecord.setValue({ fieldId: 'custrecord_lot_', value: lotInternalId });
            childRecord.setValue({ fieldId: 'custrecord__lot_quantity', value: quantity });
            childRecord.setValue({ fieldId: 'custrecord_item', value: itemId });
            childRecord.setValue({ fieldId: 'custrecord_csr_pick_task', value: csrId });
            const childId = childRecord.save();

            log.debug('Child Inventory Record Created', childId);

            // Check if all lines of the CSR are picked and update Pick Task statuses
            updateCsrPickTasksIfAllPicked(csrId);

            return {
                success: true,
                message: `Lot ${lotNumber} recorded on CSR.`
            };
        } catch (e) {
            log.error('Error in fulfillLine', e);
            throw e;
        }
    };

    /**
     * Retrieves the Pick Task status IDs from script parameters
     * @returns {Object}
     */
    const getStatusMap = () => {
        const currentScript = runtime.getCurrentScript();
        return {
            picked: currentScript.getParameter({ name: 'custscript_csr_pick_status' }) || '3',
            released: currentScript.getParameter({ name: 'custscript_csr_release_status' }) || '2',
            staged: currentScript.getParameter({ name: 'custscript_csr_stage_status' }) || '5'
        };
    };

    /**
     * Updates all Pick Tasks associated with a parent CSR record to a given status
     * @param {string|number} parentCsrId
     * @param {string} targetStatusKey
     */
    const updateCsrPickTasksStatus = (parentCsrId, targetStatusKey) => {
        try {
            const statusMap = getStatusMap();
            const targetStatusId = statusMap[targetStatusKey];
            if (!targetStatusId) {
                log.error('updateCsrPickTasksStatus', 'Invalid status key: ' + targetStatusKey);
                return;
            }

            // Find all Pick Tasks for this parent CSR record
            const pickTaskSearch = search.create({
                type: 'customrecord_tc_csr_pick',
                filters: [['custrecord_tc_csr_pt_csr', 'anyof', parentCsrId]],
                columns: ['internalid', 'custrecord_tc_csr_pt_status']
            });

            pickTaskSearch.run().each(res => {
                const id = res.id;
                const status = res.getValue('custrecord_tc_csr_pt_status');
                if (status != targetStatusId) {
                    record.submitFields({
                        type: 'customrecord_tc_csr_pick',
                        id: id,
                        values: {
                            'custrecord_tc_csr_pt_status': targetStatusId
                        },
                        options: {
                            enableSourcing: false,
                            ignoreMandatoryFields: true
                        }
                    });
                    log.debug('updateCsrPickTasksStatus', `Updated Pick Task ${id} status to ${targetStatusKey} (${targetStatusId})`);
                }
                return true;
            });
        } catch (e) {
            log.error('Error in updateCsrPickTasksStatus', e);
        }
    };

    /**
     * Checks if all pick tasks for the parent CSR of the current pick task are fully picked.
     * If all are picked, updates their statuses to "Picked".
     */
    const updateCsrPickTasksIfAllPicked = (currentPickTaskId) => {
        try {
            const statusMap = getStatusMap();
            const pickedStatusId = statusMap['picked'];
            const releasedStatusId = statusMap['released'];

            // 1. Look up the parent CSR record ID from the current Pick Task
            const lookupResult = search.lookupFields({
                type: 'customrecord_tc_csr_pick',
                id: currentPickTaskId,
                columns: ['custrecord_tc_csr_pt_csr']
            });

            if (!lookupResult || !lookupResult.custrecord_tc_csr_pt_csr || lookupResult.custrecord_tc_csr_pt_csr.length === 0) {
                log.debug('updateCsrPickTasksIfAllPicked', `No parent CSR found for Pick Task ID: ${currentPickTaskId}`);
                return;
            }

            const parentCsrId = lookupResult.custrecord_tc_csr_pt_csr[0].value;
            log.debug('updateCsrPickTasksIfAllPicked', `Parent CSR ID: ${parentCsrId}`);

            // 2. Find all Pick Tasks for this parent CSR record
            const pickTasks = [];
            const pickTaskSearch = search.create({
                type: 'customrecord_tc_csr_pick',
                filters: [['custrecord_tc_csr_pt_csr', 'anyof', parentCsrId]],
                columns: [
                    'internalid',
                    'custrecord_tc_csr_pt_qty',
                    'custrecord_tc_csr_pt_status'
                ]
            });

            const pickTaskIds = [];
            pickTaskSearch.run().each(res => {
                const id = res.id;
                const reqQty = parseFloat(res.getValue('custrecord_tc_csr_pt_qty')) || 0;
                const status = res.getValue('custrecord_tc_csr_pt_status');
                pickTasks.push({
                    id: id,
                    reqQty: reqQty,
                    status: status
                });
                pickTaskIds.push(id);
                return true;
            });

            log.debug('updateCsrPickTasksIfAllPicked', `Found ${pickTasks.length} pick task(s) for CSR ${parentCsrId}`);

            if (pickTasks.length === 0) return;

            // 3. Find sum of picked quantities for these Pick Tasks from the child details record
            const pickedQtyMap = {};
            pickTaskIds.forEach(id => {
                pickedQtyMap[id] = 0;
            });

            const pickedSearch = search.create({
                type: 'customrecord_csr_pick_task_inventory_det',
                filters: [['custrecord_csr_pick_task', 'anyof', pickTaskIds]],
                columns: [
                    search.createColumn({ name: 'custrecord_csr_pick_task', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })
                ]
            });

            pickedSearch.run().each(res => {
                const ptId = res.getValue({ name: 'custrecord_csr_pick_task', summary: search.Summary.GROUP });
                const sumQty = parseFloat(res.getValue({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })) || 0;
                pickedQtyMap[ptId] = sumQty;
                return true;
            });

            log.debug('updateCsrPickTasksIfAllPicked', `Picked quantities map: ${JSON.stringify(pickedQtyMap)}`);

            // 4. Check if all lines are fully picked
            let allPicked = true;
            for (let i = 0; i < pickTasks.length; i++) {
                const pt = pickTasks[i];
                const pickedQty = pickedQtyMap[pt.id] || 0;
                if (pickedQty < pt.reqQty) {
                    allPicked = false;
                    log.debug('updateCsrPickTasksIfAllPicked', `Pick Task ${pt.id} not fully picked. Required: ${pt.reqQty}, Picked: ${pickedQty}`);
                    break;
                }
            }

            // 5. If all are picked, set status to Picked
            if (allPicked) {
                log.audit('updateCsrPickTasksIfAllPicked', `All lines for CSR ${parentCsrId} are fully picked. Updating status to 'Picked' (${pickedStatusId}) for all pick tasks.`);
                pickTasks.forEach(pt => {
                    if (pt.status != pickedStatusId) {
                        record.submitFields({
                            type: 'customrecord_tc_csr_pick',
                            id: pt.id,
                            values: {
                                'custrecord_tc_csr_pt_status': pickedStatusId
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });
                        log.debug('updateCsrPickTasksIfAllPicked', `Updated Pick Task ${pt.id} status to Picked (${pickedStatusId})`);
                    }
                });
            } else {
                log.audit('updateCsrPickTasksIfAllPicked', `Not all lines for CSR ${parentCsrId} are fully picked. Ensuring any 'Picked' statuses are reset to 'Released' (${releasedStatusId}).`);
                pickTasks.forEach(pt => {
                    if (pt.status == pickedStatusId) {
                        record.submitFields({
                            type: 'customrecord_tc_csr_pick',
                            id: pt.id,
                            values: {
                                'custrecord_tc_csr_pt_status': releasedStatusId
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });
                        log.debug('updateCsrPickTasksIfAllPicked', `Reset Pick Task ${pt.id} status to Released (${releasedStatusId})`);
                    }
                });
            }

        } catch (e) {
            log.error('Error in updateCsrPickTasksIfAllPicked', e);
        }
    };

    /**
     * Bulk updates Sales Order lines from all validated Pick Tasks for a CSR
     */
    const fulfillCsr = (payload) => {
        const { csrId } = payload;
        log.debug('fulfillCsr Payload', payload);

        try {
            // 1. Search for all Child Inventory Details for this CSR
            const invDetailSearch = search.create({
                type: 'customrecord_csr_pick_task_inventory_det',
                filters: [
                    ['custrecord_csr_pick_task.custrecord_tc_csr_pt_csr', 'anyof', csrId]
                ],
                columns: [
                    search.createColumn({ name: "name", label: "Name" }),
                    search.createColumn({ name: "custrecord_lot_", label: "Lot #" }),
                    search.createColumn({ name: "custrecord__lot_quantity", label: "Quantity" }),
                    search.createColumn({
                        name: "custrecord_sales_order",
                        join: "CUSTRECORD_CSR_PICK_TASK",
                        label: "Sales Order"
                    }),
                    search.createColumn({
                        name: "custrecord_line_id",
                        join: "CUSTRECORD_CSR_PICK_TASK",
                        label: "Line ID"
                    }),
                    search.createColumn({
                        name: "custrecord_tc_cst_pt_item",
                        join: "CUSTRECORD_CSR_PICK_TASK",
                        label: "Item"
                    })
                ]
            });

            const results = invDetailSearch.run().getRange({ start: 0, end: 1000 });
            if (results.length === 0) {
                return { success: false, message: 'No picked lines found for this CSR.' };
            }

            const soMap = {};
            results.forEach(res => {
                const nameStr = res.getValue({ name: 'name' }) || '';

                const soMatch = nameStr.match(/_SO-(\d+)/);
                const lineMatch = nameStr.match(/_L-(\d+)/);

                const soIdFallback = res.getValue({ name: 'custrecord_sales_order', join: 'CUSTRECORD_CSR_PICK_TASK' });
                const soLineIdFallback = res.getValue({ name: 'custrecord_line_id', join: 'CUSTRECORD_CSR_PICK_TASK' });

                const soId = soMatch ? soMatch[1] : soIdFallback;
                const soLineId = lineMatch ? lineMatch[1] : soLineIdFallback;

                if (!soId || !soLineId) return;

                if (!soMap[soId]) soMap[soId] = {};
                if (!soMap[soId][soLineId]) soMap[soId][soLineId] = [];

                soMap[soId][soLineId].push({
                    lotId: res.getValue({ name: 'custrecord_lot_' }),
                    qty: res.getValue({ name: 'custrecord__lot_quantity' })
                });
            });

            // 3. Update Sales Orders
            const updatedSos = [];
            for (const soId in soMap) {
                const soLineMap = soMap[soId];
                log.debug('Updating SO', `ID: ${soId}`);

                const soRecord = record.load({
                    type: record.Type.SALES_ORDER,
                    id: soId,
                    isDynamic: true
                });

                const lineCount = soRecord.getLineCount({ sublistId: 'item' });
                let soChanged = false;

                for (let i = 0; i < lineCount; i++) {
                    soRecord.selectLine({ sublistId: 'item', line: i });
                    const currentLineId = soRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'line' });

                    if (soLineMap[currentLineId]) {
                        const assignments = soLineMap[currentLineId];

                        // Calculate total picked quantity to ensure the SO line matches the inventory detail sum
                        let totalLineQty = 0;
                        assignments.forEach(a => {
                            totalLineQty += (parseFloat(a.qty) || 0);
                        });

                        log.debug('Syncing Line Qty', `SO: ${soId}, Line: ${currentLineId}, Total Picked: ${totalLineQty}`);

                        // 1. Access Inventory Detail subrecord and clear assignments first (while line is selected)
                        let subrec = null;
                        try {
                            subrec = soRecord.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                        } catch (subErr) {
                            log.error('Inventory Detail Error', `Could not access subrecord for line ${currentLineId}: ${subErr.message}`);
                        }

                        if (subrec) {
                            const subCount = subrec.getLineCount({ sublistId: 'inventoryassignment' });
                            for (let j = subCount - 1; j >= 0; j--) {
                                subrec.removeLine({ sublistId: 'inventoryassignment', line: j });
                            }
                        }

                        // 2. Set the new line quantity
                        soRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: totalLineQty });

                        // 3. Re-populate assignments on the subrecord
                        if (subrec) {
                            assignments.forEach(assign => {
                                subrec.selectNewLine({ sublistId: 'inventoryassignment' });
                                subrec.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: assign.lotId });
                                subrec.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: parseFloat(assign.qty) });
                                subrec.commitLine({ sublistId: 'inventoryassignment' });
                            });
                        } else {
                            log.debug('No Inventory Detail Needed', `Line ${currentLineId} for SO ${soId} does not support inventory details or is not required.`);
                        }

                        // 4. Commit the line only once at the end
                        soRecord.commitLine({ sublistId: 'item' });
                        soChanged = true;
                    }
                }

                if (soChanged) {
                    soRecord.save();
                    updatedSos.push(soId);
                }
            }

            // Update all CSR Pick Tasks to "Staged"
            if (csrId) {
                updateCsrPickTasksStatus(csrId, 'staged');
            }

            return {
                success: true,
                message: `Successfully staged picks to ${updatedSos.length} Sales Order(s).`
            };
        } catch (e) {
            log.error('Error in fulfillCsr', e);
            throw e;
        }
    };

    const createItemFulfillment = (payload) => {
        const { group, csrId } = payload;
        try {
            if (!group || !group.lines || group.lines.length === 0) {
                return { success: false, error: 'No Sales Orders/Lines provided from UI group.' };
            }

            // Verify there is no discrepancy between picked quantity and staged quantity
            let discrepancyFound = false;
            group.lines.forEach(line => {
                const picked = parseFloat(line.pickedQty) || 0;
                const staged = parseFloat(line.stagingQty) || 0;
                if (staged > 0 && picked !== staged) {
                    discrepancyFound = true;
                }
            });

            if (discrepancyFound) {
                return { success: false, error: 'Picked quantities do not match staged quantities on Sales Order. Please push picks to Sales Order first.' };
            }

            const soMap = {};
            group.lines.forEach(line => {
                const soId = line.salesOrderId;
                const soLineId = line.lineId;

                if (soId && soLineId) {
                    if (!soMap[soId]) soMap[soId] = [];
                    soMap[soId].push({
                        orderLine: String(soLineId),
                        quantity: parseFloat(line.quantity) || null,
                        location: line.shipLocId || null
                    });
                }
            });

            log.debug('createItemFulfillment soMap', soMap);

            const ifIds = [];
            for (const soId in soMap) {
                const soLines = soMap[soId];
                try {
                    // Check SO status before transforming to provide better error
                    const soMeta = search.lookupFields({
                        type: record.Type.SALES_ORDER,
                        id: soId,
                        columns: ['status', 'tranid']
                    });

                    const soStatus = soMeta.status[0].value;
                    log.debug(`Processing SO ${soMeta.tranid}`, `Status: ${soStatus}`);

                    if (soStatus === 'pendingApproval') {
                        throw new Error(`Sales Order ${soMeta.tranid} is Pending Approval and cannot be fulfilled.`);
                    }

                    const fulfillMap = {};
                    soLines.forEach(line => {
                        fulfillMap[String(line.orderLine)] = line;
                    });

                    log.debug(`Trying to transform SO ${soId}`, fulfillMap);

                    let defaultValues = {};
                    let firstLocation = null;
                    Object.values(fulfillMap).forEach(line => {
                        if (line.location && !firstLocation) {
                            firstLocation = line.location;
                        }
                    });

                    if (firstLocation) {
                        defaultValues.inventorylocation = firstLocation;
                        log.debug('Using default location for IF', firstLocation);
                    }

                    let ifRecord;
                    try {
                        ifRecord = record.transform({
                            fromType: record.Type.SALES_ORDER,
                            fromId: soId,
                            toType: record.Type.ITEM_FULFILLMENT,
                            isDynamic: true,
                            defaultValues: Object.keys(defaultValues).length > 0 ? defaultValues : null
                        });
                    } catch (transformErr) {
                        log.error(`Transform failed for SO ${soId}`, transformErr);
                        throw new Error(`Could not transform Sales Order ${soMeta.tranid} to Item Fulfillment. This usually means no lines are committed or fulfillable. (Error: ${transformErr.name})`);
                    }

                    const lineCount = ifRecord.getLineCount({ sublistId: 'item' });
                    let fulfilledAny = false;

                    for (let i = 0; i < lineCount; i++) {
                        ifRecord.selectLine({ sublistId: 'item', line: i });

                        const orderLine = ifRecord.getCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'orderline'
                        });

                        const match = fulfillMap[String(orderLine)];

                        if (match) {
                            log.debug(`Match found for line ${orderLine}`, match);
                            ifRecord.setCurrentSublistValue({
                                sublistId: 'item',
                                fieldId: 'itemreceive',
                                value: true
                            });

                            if (match.quantity != null) {
                                ifRecord.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'quantity',
                                    value: match.quantity
                                });
                            }

                            if (match.location != null) {
                                ifRecord.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'location',
                                    value: match.location
                                });
                            }

                            fulfilledAny = true;
                        } else {
                            ifRecord.setCurrentSublistValue({
                                sublistId: 'item',
                                fieldId: 'itemreceive',
                                value: false
                            });
                        }

                        ifRecord.commitLine({ sublistId: 'item' });
                    }

                    if (fulfilledAny) {
                        const ifId = ifRecord.save({
                            enableSourcing: true,
                            ignoreMandatoryFields: true // Sometimes mandatory fields prevent save via script
                        });
                        log.debug('Item Fulfillment Created', ifId);
                        ifIds.push(ifId);
                    } else {
                        log.error(`No matching lines fulfilled for SO ${soId}`, 'Check orderline mapping.');
                    }
                } catch (tranErr) {
                    log.error(`Error processing SO ${soId}`, tranErr);
                    throw tranErr; // Rethrow to provide feedback to UI
                }
            }

            if (ifIds.length > 0) {
                if (csrId) {
                    updateCsrPickTasksStatus(csrId, 'staged');
                }
                return { success: true, data: { message: `Successfully created ${ifIds.length} Item Fulfillment(s).` } };
            } else {
                return { success: false, error: 'Failed to create Item Fulfillments. Please check the logs for more details.' };
            }
        } catch (e) {
            log.error('Error in createItemFulfillment', e);
            return { success: false, error: e.message };
        }
    };

    const getPickTasks = () => {
        const customrecord_tc_csr_pickSearchObj = search.create({
            type: "customrecord_tc_csr_pick",
            filters: [
                (function () {
                    const user = runtime.getCurrentUser();
                    const userSubsidiary = user.subsidiary;
                    const isAdmin = user.role === 3;
                    return (userSubsidiary && !isAdmin) ? ["custrecord_tc_csr_pt_csr.subsidiary", "anyof", userSubsidiary] : [];
                })()
            ].filter(f => f.length > 0),
            columns:
                [
                    search.createColumn({ name: "custrecord_tc_csr_pt_status", label: "Status" }),
                    search.createColumn({ name: "custrecord_tc_csr_pt_csr", label: "CSR" }),
                    search.createColumn({ name: "custrecord_tc_cst_pt_item", label: "Item" }),
                    search.createColumn({ name: "custrecord_tc_csr_pt_qty", label: "Pick Qty" }),
                    search.createColumn({ name: "custrecord_tc_csr_pt_picked", label: "Picked Qty" })
                ]
        });

        const results = [];
        const pagedData = customrecord_tc_csr_pickSearchObj.runPaged({ pageSize: 1000 });
        for (let i = 0; i < pagedData.pageRanges.length; i++) {
            const page = pagedData.fetch({ index: pagedData.pageRanges[i].index });
            page.data.forEach(function (result) {
                results.push({
                    id: result.id,
                    status: result.getValue("custrecord_tc_csr_pt_status"),
                    statusText: result.getText("custrecord_tc_csr_pt_status"),
                    csr: result.getValue("custrecord_tc_csr_pt_csr"),
                    csrText: result.getText("custrecord_tc_csr_pt_csr"),
                    item: result.getValue("custrecord_tc_cst_pt_item"),
                    itemText: result.getText("custrecord_tc_cst_pt_item"),
                    pickQty: result.getValue("custrecord_tc_csr_pt_qty"),
                    pickedQty: result.getValue("custrecord_tc_csr_pt_picked")
                });
            });
        }
        return results;
    };

    const getInventoryDetails = (payload) => {
        try {
            const { soId, lineId } = payload;

            log.debug('payload', payload);
            const salesorderSearchObj = search.create({
                type: "salesorder",
                settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                filters:
                    [
                        ["type", "anyof", "SalesOrd"],
                        "AND",
                        ["internalid", "anyof", soId],
                        "AND",
                        ["inventorydetail.quantity", "greaterthan", 0],
                        "AND",
                        ["line", "equalto", lineId]
                    ],
                columns:
                    [
                        search.createColumn({ name: "item", label: "Item" }),
                        search.createColumn({ name: "displayname", join: "item", label: "Display Name" }),
                        search.createColumn({
                            name: "inventorynumber",
                            join: "inventoryDetail",
                            label: " Number"
                        }),
                        search.createColumn({
                            name: "binnumber",
                            join: "inventoryDetail",
                            label: "Bin Number"
                        }),
                        search.createColumn({
                            name: "quantity",
                            join: "inventoryDetail",
                            label: "Quantity"
                        }),
                        search.createColumn({
                            name: "expirationdate",
                            join: "inventoryDetail",
                            label: "Expiration Date"
                        }),
                        search.createColumn({
                            name: "internalid",
                            join: "inventoryDetail",
                            label: "Inv Internal ID"
                        })
                    ]
            });

            const results = [];
            salesorderSearchObj.run().each(result => {
                results.push({
                    item: result.getText("item"),
                    displayName: result.getValue({ name: "displayname", join: "item" }),
                    invNumber: result.getText({ name: "inventorynumber", join: "inventoryDetail" }),
                    binNumber: result.getText({ name: "binnumber", join: "inventoryDetail" }),
                    quantity: result.getValue({ name: "quantity", join: "inventoryDetail" }),
                    expirationDate: result.getValue({ name: "expirationdate", join: "inventoryDetail" }),
                    invId: result.getValue({ name: "internalid", join: "inventoryDetail" })
                });
                return true;
            });
            return results;
        } catch (error) {
            log.error('Error in getInventoryDetails', error);
            return [];
        }
    };

    const findLotInternalId = (lotNumber, itemId) => {
        const inventoryNumberSearch = search.create({
            type: "inventorynumber",
            filters: [
                ["inventorynumber", "is", lotNumber],
                "AND",
                ["item", "anyof", itemId]
            ],
            columns: ["internalid"]
        });
        const resultSet = inventoryNumberSearch.run().getRange({ start: 0, end: 1 });
        return resultSet.length > 0 ? resultSet[0].getValue("internalid") : null;
    };

    const getFilterOptions = (params) => {
        try {
            const { locationId } = params;
            const locations = [];
            const user = runtime.getCurrentUser();
            const userSubsidiary = user.subsidiary;
            const isAdmin = user.role === 3;

            const locFilters = [
                ["isinactive", "is", "F"]
            ];

            if (userSubsidiary && !isAdmin) {
                locFilters.push("AND", ["subsidiary", "anyof", userSubsidiary]);
            }

            const locationSearchObj = search.create({
                type: "location",
                filters: locFilters,
                columns: [
                    search.createColumn({ name: "name", label: "Name", sort: search.Sort.ASC })
                ]
            });

            locationSearchObj.run().each(r => {
                const id = r.id;
                const name = r.getValue({ name: "name" });
                if (id && name) {
                    locations.push({ id: id, name: name });
                }
                return true;
            });

            const custFilters = [
                ["custrecord_tc_csr_pt_csr.custbody_ds_scrap_record", "is", "F"],
                "AND",
                ["formulanumeric: CASE WHEN {internalid} = {custrecord_tc_csr_pt_csr.custcol_csr_pick_task_link.id} THEN 1 ELSE 0 END", "equalto", "1"],
                "AND",
                ["formulanumeric: TO_NUMBER(NVL({custrecord_tc_csr_pt_csr.custcol_tc_item_qty}, 0)) - TO_NUMBER(NVL({custrecord_tc_csr_pt_csr.quantityshiprecv}, 0))", "greaterthan", 0]
            ];

            if (locationId) {
                custFilters.push("AND", ["custrecord_tc_csr_pt_csr.custbody_tc_shipping_loc", "anyof", locationId]);
            }

            const customersMap = {};
            const custSearch = search.create({
                type: "customrecord_tc_csr_pick",
                filters: custFilters,
                columns: [
                    search.createColumn({
                        name: "custbody_tc_customer",
                        join: "custrecord_tc_csr_pt_csr",
                        summary: "GROUP",
                        sort: search.Sort.ASC
                    })
                ]
            });
            custSearch.run().each(r => {
                const id = r.getValue({ name: "custbody_tc_customer", join: "custrecord_tc_csr_pt_csr", summary: "GROUP" });
                const name = r.getText({ name: "custbody_tc_customer", join: "custrecord_tc_csr_pt_csr", summary: "GROUP" });
                if (id && name) {
                    customersMap[id] = name;
                }
                return true;
            });

            try {
                const soCustFilters = [
                    ["type", "anyof", "SalesOrd"],
                    "AND",
                    ["mainline", "is", "T"],
                    "AND",
                    ["status", "anyof", "SalesOrd:A", "SalesOrd:B", "SalesOrd:D", "SalesOrd:E", "SalesOrd:F"],
                    "AND",
                    ["CUSTBODY_TC_TO_CUSTOMER", "noneof", "@NONE@"]
                ];
                if (locationId) {
                    soCustFilters.push("AND", ["location", "anyof", locationId]);
                }
                const soCustSearch = search.create({
                    type: "salesorder",
                    filters: soCustFilters,
                    columns: [
                        search.createColumn({
                            name: "CUSTBODY_TC_TO_CUSTOMER",
                            summary: "GROUP",
                            sort: search.Sort.ASC
                        })
                    ]
                });
                soCustSearch.run().each(r => {
                    const id = r.getValue({ name: "CUSTBODY_TC_TO_CUSTOMER", summary: "GROUP" });
                    const name = r.getText({ name: "CUSTBODY_TC_TO_CUSTOMER", summary: "GROUP" });
                    if (id && name) {
                        customersMap[id] = name;
                    }
                    return true;
                });
            } catch (soCustErr) {
                log.error('Error fetching SO customers in getFilterOptions', soCustErr);
            }

            const customers = [];
            for (const id in customersMap) {
                customers.push({ id: id, name: customersMap[id] });
            }
            customers.sort((a, b) => a.name.localeCompare(b.name));

            return { locations: locations, customers: customers };
        } catch (e) {
            log.error('Error in getFilterOptions', e);
            return { locations: [], customers: [] };
        }
    };

    /**
     * Returns all lot numbers for a particular item, optionally filtered by location
     * @param {Object|string|number} payload - Internal ID of the item or an object containing itemId and locationId
     * @returns {Array}
     */
    function getLotNumbersByItem(payload) {
        var itemId = typeof payload === 'object' ? payload.itemId : payload;
        var locationId = typeof payload === 'object' ? payload.locationId : null;
        var lotList = [];

        var filters = [
            ['item', 'anyof', itemId],
            'AND',
            ['quantityavailable', 'greaterthan', 0]
        ];

        if (locationId) {
            filters.push('AND', ['location', 'anyof', locationId]);
        }

        var lotSearch = search.create({
            type: 'inventorynumber',
            filters: filters,
            columns: [
                search.createColumn({ name: 'inventorynumber', sort: search.Sort.ASC }),
                search.createColumn({ name: 'item' }),
                search.createColumn({ name: 'expirationdate' }),
                search.createColumn({ name: 'quantityonhand' }),
                search.createColumn({ name: 'quantityavailable' })
            ]
        });

        var tempLotMap = {};
        var lotIds = [];

        lotSearch.run().each(function (result) {
            var invinternalid = result.id;
            var qtyAvail = parseFloat(result.getValue({ name: 'quantityavailable' })) || 0;

            if (!tempLotMap[invinternalid]) {
                tempLotMap[invinternalid] = {
                    lotNumber: result.getValue({ name: 'inventorynumber' }),
                    quantityAvailable: qtyAvail,
                    internalid: invinternalid
                };
                lotIds.push(invinternalid);
            }
            return true;
        });

        // Subtract already picked quantities for these lots
        if (lotIds.length > 0) {
            var pickedSearch = search.create({
                type: 'customrecord_csr_pick_task_inventory_det',
                filters: [
                    ['custrecord_lot_', 'anyof', lotIds]
                ],
                columns: [
                    search.createColumn({ name: 'custrecord_lot_', summary: search.Summary.GROUP }),
                    search.createColumn({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })
                ]
            });

            pickedSearch.run().each(function (res) {
                var lotId = res.getValue({ name: 'custrecord_lot_', summary: search.Summary.GROUP });
                var pickedQty = parseFloat(res.getValue({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })) || 0;

                if (tempLotMap[lotId]) {
                    tempLotMap[lotId].quantityAvailable -= pickedQty;
                }
                return true;
            });
        }

        Object.keys(tempLotMap).forEach(function (k) {
            if (tempLotMap[k].quantityAvailable > 0) {
                lotList.push({
                    lotNumber: tempLotMap[k].lotNumber,
                    quantityAvailable: tempLotMap[k].quantityAvailable
                });
            }
        });

        return lotList;
    }

    /**
     * Returns child custom records containing lot specifics for a Pick Task
     * @param {string} pickTaskId - Internal ID of the CSR Pick Task
     * @returns {Array}
     */
    function getChildInventoryDetails(pickTaskId) {
        var childList = [];
        if (!pickTaskId) return childList;

        var childSearch = search.create({
            type: 'customrecord_csr_pick_task_inventory_det',
            filters: [
                ['custrecord_csr_pick_task', 'anyof', pickTaskId]
            ],
            columns: [
                search.createColumn({ name: 'name', sort: search.Sort.ASC }),
                search.createColumn({ name: 'custrecord_lot_' }),
                search.createColumn({ name: 'custrecord__lot_quantity' }),
                search.createColumn({ name: 'custrecord_item' }),
                search.createColumn({ name: 'created' })
            ]
        });

        childSearch.run().each(function (result) {
            childList.push({
                id: result.id,
                name: result.getValue({ name: 'name' }),
                lotText: result.getText({ name: 'custrecord_lot_' }) || result.getValue({ name: 'custrecord_lot_' }),
                quantity: result.getValue({ name: 'custrecord__lot_quantity' }),
                itemText: result.getText({ name: 'custrecord_item' }),
                dateCreated: result.getValue({ name: 'created' })
            });
            return true;
        });

        return childList;
    }

    /**
     * Updates picked child inventory detail quantity and recalculates Pick Task status
     * @param {Object} payload - contains detailId and quantity
     * @returns {Object}
     */
    function updateChildInventory(payload) {
        var detailId = payload.detailId;
        var quantity = payload.quantity;
        try {
            var childRec = record.load({
                type: 'customrecord_csr_pick_task_inventory_det',
                id: detailId,
                isDynamic: true
            });
            var pickTaskId = childRec.getValue('custrecord_csr_pick_task');

            childRec.setValue({
                fieldId: 'custrecord__lot_quantity',
                value: quantity
            });
            childRec.save();

            log.audit('updateChildInventory', 'Updated child detail ' + detailId + ' to quantity ' + quantity);

            if (pickTaskId) {
                updateCsrPickTasksIfAllPicked(pickTaskId);
            }

            return { success: true };
        } catch (e) {
            log.error('Error in updateChildInventory', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Deletes picked child inventory detail and recalculates Pick Task status
     * @param {Object} payload - contains detailId
     * @returns {Object}
     */
    function deleteChildInventory(payload) {
        var detailId = payload.detailId;
        try {
            var lookup = search.lookupFields({
                type: 'customrecord_csr_pick_task_inventory_det',
                id: detailId,
                columns: ['custrecord_csr_pick_task']
            });
            var pickTaskId = lookup.custrecord_csr_pick_task && lookup.custrecord_csr_pick_task[0] ? lookup.custrecord_csr_pick_task[0].value : null;

            record.delete({
                type: 'customrecord_csr_pick_task_inventory_det',
                id: detailId
            });

            log.audit('deleteChildInventory', 'Deleted child detail ' + detailId);

            if (pickTaskId) {
                updateCsrPickTasksIfAllPicked(pickTaskId);
            }

            return { success: true };
        } catch (e) {
            log.error('Error in deleteChildInventory', e);
            return { success: false, error: e.message };
        }
    }

    return { onRequest };
});
