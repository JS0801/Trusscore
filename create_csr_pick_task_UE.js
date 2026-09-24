/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/log'], (record, log) => {

    const ITEM_SUBLIST = 'line';

    const PICK_TASK_RECORD = 'customrecord_tc_csr_pick';

    const FLD_PICK_CSR = 'custrecord_tc_csr_pt_csr';
    const FLD_PICK_STATUS = 'custrecord_tc_csr_pt_status';
    const FLD_PICK_ITEM = 'custrecord_tc_cst_pt_item';
    const FLD_PICK_QTY = 'custrecord_tc_csr_pt_qty';

    const CSR_LINE_PICK_LINK = 'custcol_csr_pick_task_link';
    const CSR_PICK_TASK_SO = 'custrecord_sales_order';

    const STATUS_UNRELEASED = 1;
    const STATUS_RELEASED = 2; // Pick task status list - Released

    // CSR header picking status field + backend id for "Released"
    const FLD_CSR_PICKING_STATUS = 'custbody_picking_status';
    const PICKING_STATUS_RELEASED = 1;

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
            const tranId = newRec.getValue({ fieldId: 'tranid' });

            // Only proceed if CSR picking status is Released
            const pickingStatus = newRec.getValue({ fieldId: FLD_CSR_PICKING_STATUS });
            const pickingStatusText = newRec.getText
                ? newRec.getText({ fieldId: FLD_CSR_PICKING_STATUS })
                : null;

            log.debug({
                title: 'Picking Status Check',
                details: {
                    csrId: csrId,
                    rawValue: pickingStatus,
                    rawValueType: typeof pickingStatus,
                    textValue: pickingStatusText,
                    coercedNumber: Number(pickingStatus),
                    expectedReleasedId: PICKING_STATUS_RELEASED
                }
            });

            if (Number(pickingStatus) !== PICKING_STATUS_RELEASED) {
                log.audit({
                    title: 'Skipped - Not Released',
                    details: `CSR ${csrId} status is ${pickingStatus}, not Released (${PICKING_STATUS_RELEASED}). No pick tasks created.`
                });
                return;
            }

            log.audit({
                title: 'Script Start',
                details: {
                    eventType: context.type,
                    csrId: csrId,
                    csrType: csrType,
                    tranId: tranId,
                    pickingStatus: pickingStatus
                }
            });

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

                const lineObj = {
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

            // Any line with an item is actionable - either update its existing
            // pick task, or (if new/unlinked) create one.
            let needsProcessing = false;
            for (let k = 0; k < lineDataArr.length; k++) {
                if (lineDataArr[k].itemId) {
                    needsProcessing = true;
                    break;
                }
            }

            if (!needsProcessing) {
                log.audit({
                    title: 'No Action Required',
                    details: `No item lines on CSR ${csrId} to process.`
                });
                return;
            }

            // Load CSR again in dynamic false mode so line values can be updated by index
            const csrRec = record.load({
                type: csrType,
                id: csrId,
                isDynamic: false
            });

            // Process each line: update existing pick task, or create a new one
            for (let j = 0; j < lineDataArr.length; j++) {
                const lineObj = lineDataArr[j];

                // Skip line if no item
                if (!lineObj.itemId) {
                    log.debug({
                        title: `Skipped Line ${j}`,
                        details: 'Item is blank, so no pick task action taken'
                    });
                    continue;
                }

                if (lineObj.existingPickTask) {
                    // Line already has a pick task attached - sync item/qty/SO
                    // in case they changed on this edit.
                    try {
                        const existingPickRec = record.load({
                            type: PICK_TASK_RECORD,
                            id: lineObj.existingPickTask,
                            isDynamic: true
                        });

                        existingPickRec.setValue({
                            fieldId: FLD_PICK_ITEM,
                            value: lineObj.itemId
                        });

                        existingPickRec.setValue({
                            fieldId: FLD_PICK_QTY,
                            value: lineObj.qty || 0
                        });

                        existingPickRec.setValue({
                            fieldId: FLD_PICK_STATUS,
                            value: STATUS_RELEASED
                        });

                        if (lineObj.salesOrder) {
                            existingPickRec.setValue({
                                fieldId: CSR_PICK_TASK_SO,
                                value: lineObj.salesOrder
                            });
                        }

                        const updatedPickTaskId = existingPickRec.save({
                            enableSourcing: true,
                            ignoreMandatoryFields: false
                        });

                        log.audit({
                            title: `Pick Task Updated for Line ${j}`,
                            details: {
                                csrId: csrId,
                                lineIndex: lineObj.lineIndex,
                                lineNumber: lineObj.lineNumber,
                                itemId: lineObj.itemId,
                                qty: lineObj.qty,
                                pickTaskId: updatedPickTaskId
                            }
                        });
                    } catch (updateErr) {
                        log.error({
                            title: `Pick Task Update Error - Line ${j}`,
                            details: {
                                csrId: csrId,
                                pickTaskId: lineObj.existingPickTask,
                                error: updateErr
                            }
                        });
                    }

                    // Already linked, no need to touch CSR_LINE_PICK_LINK
                    continue;
                }

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

                // Set status = Released (CSR is Released when this path runs)
                pickTaskRec.setValue({
                    fieldId: FLD_PICK_STATUS,
                    value: STATUS_RELEASED
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

                const pickTaskId = pickTaskRec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });

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
        afterSubmit: afterSubmit
    };
});