/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/log', 'N/search'], (record, log, search) => {

    const ITEM_SUBLIST = 'line';

    const PICK_TASK_RECORD = 'customrecord_tc_csr_pick';

    const FLD_PICK_CSR = 'custrecord_tc_csr_pt_csr';
    const FLD_PICK_STATUS = 'custrecord_tc_csr_pt_status';
    const FLD_PICK_ITEM = 'custrecord_tc_cst_pt_item';
    const FLD_PICK_QTY = 'custrecord_tc_csr_pt_qty';

    const CSR_LINE_PICK_LINK = 'custcol_csr_pick_task_link';
    const CSR_PICK_TASK_SO = 'custrecord_sales_order';

    const STATUS_UNRELEASED = 1;
    const STATUS_CANCELLED = 4;
    const FLD_CSR_SCRAP = 'custbody_ds_scrap_record';
    const FLD_LINE_REMOVE = 'custcol_ds_remove';

    function isScrap(csrRecord) {
        const value = csrRecord.getValue({ fieldId: FLD_CSR_SCRAP });
        return value === true || value === 'T';
    }

    function cancelPickTasks(csrId) {
        // Search by parent CSR, including tasks no longer linked on a current line.
        // Do not filter by status or inactive flag: all associated tasks must cancel.
        const tasks = search.create({
            type: PICK_TASK_RECORD,
            filters: [[FLD_PICK_CSR, 'anyof', csrId]],
            columns: [
                search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
                FLD_PICK_STATUS
            ]
        }).runPaged({ pageSize: 1000 });
        const pending = [];
        tasks.pageRanges.forEach(range => {
            tasks.fetch({ index: range.index }).data.forEach(result => {
                if (String(result.getValue({ name: FLD_PICK_STATUS })) !== String(STATUS_CANCELLED)) {
                    pending.push(result.id);
                }
            });
        });

        let cancelled = 0;
        const failed = [];
        pending.forEach(taskId => {
            try {
                record.submitFields({
                    type: PICK_TASK_RECORD,
                    id: taskId,
                    values: { [FLD_PICK_STATUS]: STATUS_CANCELLED },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                });
                cancelled++;
            } catch (error) {
                failed.push(taskId);
                log.error({ title: 'Scrap CSR task cancellation failed: ' + taskId, details: error });
            }
        });
        log.audit({
            title: 'Scrap CSR pick task cancellation',
            details: { csrId: csrId, cancelled: cancelled, failedTaskIds: failed }
        });
        if (failed.length) {
            throw new Error('CSR ' + csrId + ': could not cancel pick tasks ' + failed.join(', ') + '. Review script logs and save the CSR again to retry.');
        }
    }

    // Attach the companion client script only on the saved CSR View page.
    function beforeLoad(context) {
        if (context.type !== context.UserEventType.VIEW || !context.newRecord.id) return;
        try {
            if (isScrap(context.newRecord)) return;
            const csrId = String(context.newRecord.id);
            if (!/^\d+$/.test(csrId)) return;
            const unreleased = search.create({
                type: PICK_TASK_RECORD,
                filters: [
                    [FLD_PICK_CSR, 'anyof', csrId], 'AND',
                    [FLD_PICK_STATUS, 'anyof', STATUS_UNRELEASED], 'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1 });
            if (!unreleased.length) return;

            context.form.clientScriptModulePath = './tc_csr_release_pick_tasks_cs.js';
            context.form.addButton({
                id: 'custpage_tc_release_pick_tasks',
                label: 'Release Pick Tasks',
                functionName: 'releasePickTasks(' + csrId + ')'
            });
        } catch (e) {
            log.error({ title: 'Release Pick Tasks button error', details: e });
        }
    }

    function afterSubmit(context) {
        try {
            // Run only on create and edit
            if (
                context.type !== context.UserEventType.CREATE &&
                context.type !== context.UserEventType.EDIT
            ) {
                log.debug({
                    title: 'Skipped Event',
                    details: `Event type ${context.type} is not supported`
                });
                return;
            }

            const newRec = context.newRecord;
            const csrId = newRec.id;
            const csrType = newRec.type;
            // Scrap takes precedence over task creation, even when there are no CSR lines.
            if (isScrap(newRec)) {
                cancelPickTasks(csrId);
                return;
            }
            const tranId = newRec.getValue({ fieldId: 'tranid' });

            const lineCount = newRec.getLineCount({ sublistId: ITEM_SUBLIST });

            log.debug({
                title: 'Line Count',
                details: `CSR ${csrId} has ${lineCount} line(s)`
            });

            if (!lineCount) {
                log.debug({
                    title: 'No Lines Found',
                    details: `No item lines found on CSR ${csrId}`
                });
                return;
            }

            const lineDataArr = [];
            const removedTaskIds = new Set();

            // Read all lines first and store required details
            for (let i = 0; i < lineCount; i++) {
                const itemId = newRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: 'custcol_tc_item',
                    line: i
                });

                const qty = newRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: 'custcol_tc_item_qty',
                    line: i
                });

                const orderLine = newRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: 'line',
                    line: i
                });

                const salesOrder = newRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: 'custcol_tc_sales_order',
                    line: i
                });

                const existingPickTask = newRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: CSR_LINE_PICK_LINK,
                    line: i
                });

                const removeValue = newRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: FLD_LINE_REMOVE,
                    line: i
                });
                const isRemoved = removeValue === true || removeValue === 'T';
                if (isRemoved && existingPickTask) removedTaskIds.add(String(existingPickTask));

                const lineObj = {
                    isRemoved: isRemoved,
                    lineIndex: i,
                    csrId: csrId,
                    soNumber: tranId,
                    itemId: itemId,
                    qty: qty,
                    lineNumber: orderLine,
                    salesOrder: salesOrder || null,
                    existingPickTask: existingPickTask || null
                };

                lineDataArr.push(lineObj);

                log.debug({
                    title: `Line Read ${i}`,
                    details: lineObj
                });
            }

            log.audit({
                title: 'All Lines Read',
                details: `Prepared ${lineDataArr.length} line object(s) for CSR ${csrId}`
            });

            // Cancel removed lines before the creation early-return, even if the item is blank.
            removedTaskIds.forEach(taskId => {
                try {
                    record.submitFields({
                        type: PICK_TASK_RECORD,
                        id: taskId,
                        values: { [FLD_PICK_STATUS]: STATUS_CANCELLED },
                        options: { enableSourcing: false, ignoreMandatoryFields: true }
                    });
                    log.audit({ title: 'Removed CSR line task cancelled', details: { csrId: csrId, taskId: taskId } });
                } catch (error) {
                    log.error({ title: 'Removed CSR line task cancellation failed: ' + taskId, details: error });
                }
            });

            // Only non-removed item lines without a linked pick task need processing.
            let needsProcessing = false;
            for (let k = 0; k < lineDataArr.length; k++) {
                if (!lineDataArr[k].isRemoved && lineDataArr[k].itemId && !lineDataArr[k].existingPickTask) {
                    needsProcessing = true;
                    break;
                }
            }

            if (!needsProcessing) {
                log.audit({
                    title: 'No Action Required',
                    details: `No missing pick tasks on CSR ${csrId}.`
                });
                return;
            }

            // Load CSR again in dynamic false mode so line values can be updated by index
            const csrRec = record.load({
                type: csrType,
                id: csrId,
                isDynamic: false
            });

            let createdCount = 0;

            // Preserve all existing tasks, including their picks and statuses.
            for (let j = 0; j < lineDataArr.length; j++) {
                const lineObj = lineDataArr[j];
                if (lineObj.isRemoved) continue;

                // Skip line if no item
                if (!lineObj.itemId) {
                    log.debug({
                        title: `Skipped Line ${j}`,
                        details: 'Item is blank, so no pick task action taken'
                    });
                    continue;
                }

                const latestPickTask = csrRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: CSR_LINE_PICK_LINK,
                    line: lineObj.lineIndex
                });
                if (lineObj.existingPickTask || latestPickTask) continue;

                // No pick task linked yet on this line - create a new one
                const pickTaskRec = record.create({
                    type: PICK_TASK_RECORD,
                    isDynamic: true
                });

                // Set CSR reference
                pickTaskRec.setValue({
                    fieldId: FLD_PICK_CSR,
                    value: csrId
                });

                // New tasks require an explicit release action.
                pickTaskRec.setValue({
                    fieldId: FLD_PICK_STATUS,
                    value: STATUS_UNRELEASED
                });

                // Set item
                pickTaskRec.setValue({
                    fieldId: FLD_PICK_ITEM,
                    value: lineObj.itemId
                });

                // Set quantity
                pickTaskRec.setValue({
                    fieldId: FLD_PICK_QTY,
                    value: lineObj.qty || 0
                });

                if (lineObj.salesOrder) {
                    pickTaskRec.setValue({
                        fieldId: CSR_PICK_TASK_SO,
                        value: lineObj.salesOrder
                    });
                }

                // Preserve the manually entered source Sales Order line reference.
                const sourceSoLineId = csrRec.getSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: 'custcol_tc_line_id',
                    line: lineObj.lineIndex
                });
                if (sourceSoLineId !== '' && sourceSoLineId != null) {
                    pickTaskRec.setValue({ fieldId: 'custrecord_line_id', value: String(sourceSoLineId) });
                }

                const pickTaskId = pickTaskRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

                createdCount++;

                log.audit({
                    title: `Pick Task Created for Line ${j}`,
                    details: {
                        csrId: csrId,
                        lineIndex: lineObj.lineIndex,
                        lineNumber: lineObj.lineNumber,
                        itemId: lineObj.itemId,
                        qty: lineObj.qty,
                        pickTaskId: pickTaskId
                    }
                });

                // Update line back on CSR with created Pick Task ID
                csrRec.setSublistValue({
                    sublistId: ITEM_SUBLIST,
                    fieldId: CSR_LINE_PICK_LINK,
                    line: lineObj.lineIndex,
                    value: pickTaskId
                });

                log.debug({
                    title: `CSR Line Updated ${j}`,
                    details: `Set ${CSR_LINE_PICK_LINK} = ${pickTaskId} on line index ${lineObj.lineIndex}`
                });
            }

            if (!createdCount) return;

            const savedCsrId = csrRec.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });

            log.audit({
                title: 'CSR Updated Successfully',
                details: `CSR ${savedCsrId} saved with pick task links`
            });

        } catch (e) {
            log.error({
                title: 'afterSubmit Error',
                details: e
            });
        }
    }

    return {
        beforeLoad: beforeLoad,
        afterSubmit: afterSubmit
    };
});