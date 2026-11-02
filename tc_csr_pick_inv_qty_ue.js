/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/search', 'N/record', 'N/log'], (search, record, log) => {

    const CHILD_RECORD_TYPE = 'customrecord_csr_pick_task_inventory_det';
    const CHILD_PARENT_FIELD = 'custrecord_csr_pick_task';
    const CHILD_QTY_FIELD = 'custrecord__lot_quantity';

    const PARENT_RECORD_TYPE = 'customrecord_tc_csr_pick';
    const PARENT_TOTAL_FIELD = 'custrecord_total_inventory_quantity';

    function afterSubmit(context) {
        try {
            const parentIds = new Set();

            if (context.oldRecord) {
                const oldParentId = context.oldRecord.getValue({ fieldId: CHILD_PARENT_FIELD });
                if (oldParentId) {
                    parentIds.add(String(oldParentId));
                }
            }

            if (context.newRecord) {
                const newParentId = context.newRecord.getValue({ fieldId: CHILD_PARENT_FIELD });
                if (newParentId) {
                    parentIds.add(String(newParentId));
                }
            }

            if (parentIds.size === 0) {
                return;
            }

            parentIds.forEach((parentId) => {
                const totalQty = getTotalChildQuantity(parentId);

                record.submitFields({
                    type: PARENT_RECORD_TYPE,
                    id: parentId,
                    values: {
                        [PARENT_TOTAL_FIELD]: totalQty
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });

                log.debug({
                    title: 'Parent updated',
                    details: `Parent ID ${parentId} updated with total quantity ${totalQty}`
                });
            });

        } catch (e) {
            log.error({
                title: 'Error updating parent total quantity',
                details: e
            });
        }
    }

    function getTotalChildQuantity(parentId) {
        const results = search.create({
            type: CHILD_RECORD_TYPE,
            filters: [
                [CHILD_PARENT_FIELD, 'anyof', parentId]
            ],
            columns: [
                search.createColumn({
                    name: CHILD_QTY_FIELD,
                    summary: search.Summary.SUM
                })
            ]
        }).run().getRange({
            start: 0,
            end: 1
        });

        if (!results || results.length === 0) {
            return 0;
        }

        return parseFloat(results[0].getValue({
            name: CHILD_QTY_FIELD,
            summary: search.Summary.SUM
        })) || 0;
    }

    return {
        afterSubmit: afterSubmit
    };
});
