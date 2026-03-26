/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/search'], function(record, search) {

    function afterSubmit(context) {
        if (context.type !== context.UserEventType.CREATE && 
            context.type !== context.UserEventType.EDIT) return;

        try {
            var assemblyBuildId = context.newRecord.id;
            if (!assemblyBuildId) return;

            // Reload the Assembly Build as a standard record so we can edit inventory details
            var assemblyBuild = record.load({
                type: record.Type.ASSEMBLY_BUILD,
                id: assemblyBuildId,
                isDynamic: false
            });

            var woId = assemblyBuild.getValue('createdfrom');
            if (!woId) return;

            var buildQty = Number(assemblyBuild.getValue('quantity')) || 0;

            // 1) Load Work Order to get Bill of Material
            var woRec = record.load({ type: 'workorder', id: woId });
            var bomId = woRec.getValue('billofmaterials');
            if (!bomId) return;

            var today = new Date();

            // 2) Find active BOM Revision for this BOM
            var revisionSearch = search.create({
                type: 'bomrevision',
                filters: [
                    ['billofmaterials', 'anyof', bomId],
                    'AND',
                    ['isinactive', 'is', 'F'],
                    'AND',
                    ['effectivestartdate', 'onorbefore', 'today'],
                    'AND',
                    [
                        ['effectiveenddate', 'onorafter', 'today'],
                        'OR',
                        ['effectiveenddate', 'isempty', '']
                    ]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({
                        name: 'effectivestartdate',
                        sort: search.Sort.DESC // pick the latest start date
                    }),
                    search.createColumn({ name: 'isinactive' }) 
                ]
            });

            var bomRevisionId;
            revisionSearch.run().each(function(r) {
            log.debug('Revision Candidate', {
                id: r.getValue('internalid'),
                start: r.getValue('effectivestartdate'),
                end: r.getValue('effectiveenddate'),
                inactive: r.getValue('isinactive')
            });
                bomRevisionId = r.getValue('internalid');
                return false; // just grab first active revision
            });

            if (!bomRevisionId) {
                log.debug('No Active BOM Revision', 'No revision found for BOM ' + bomId);
                return;
            }

            log.debug('bomRevisionId', bomRevisionId);

            // 3) Load BOM Revision lines
            var revisionRec = record.load({
                type: 'bomrevision',
                id: bomRevisionId
            });

            var lineCount = revisionRec.getLineCount({ sublistId: 'component' });
            var bomMap = {};

            for (var i = 0; i < lineCount; i++) {
                var itemId = revisionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'item',
                    line: i
                });
                var bomQty = revisionRec.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'quantity',
                    line: i
                });

                if (itemId) {
                    bomMap[itemId] = Number(bomQty) || 0;
                }
            }

            log.debug('bomMap', bomMap);

            // 4) Update Assembly Build component lines
            var compCount = assemblyBuild.getLineCount({ sublistId: 'component' });
            for (var j = 0; j < compCount; j++) {
                var componentItemId = assemblyBuild.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'item',
                    line: j
                });
                
                var qty = parseFloat(assemblyBuild.getSublistValue({
                    sublistId: 'component',
                    fieldId: 'quantity',
                    line: j
                }));
                
                var roundCode = getItemRoundingCode(componentItemId);
                
                if (roundCode === 0 && !isNaN(qty) && qty !== 0) {
                   var calculatedRevisedQTY = parseFloat(bomMap[componentItemId] * buildQty).toFixed(2);
                  log.debug('calculatedRevisedQTY',calculatedRevisedQTY)
                    var roundedQty = Math.ceil(calculatedRevisedQTY);
                  log.debug('roundedQty',roundedQty)

                    if (roundedQty == 0) {
                      roundedQty = 1
                    }
                  
                    if (roundedQty > 0) {
                        assemblyBuild.setSublistValue({
                            sublistId: 'component',
                            fieldId: 'quantity',
                            line: j,
                            value: roundedQty
                        });
            
                        var itemType = getItemType(componentItemId);
                        if (itemType !== 'NonInvtPart') {
                            var inventoryDetail = assemblyBuild.getSublistSubrecord({
                                sublistId: 'component',
                                fieldId: 'componentinventorydetail',
                                line: j
                            });

                            log.debug('inventoryDetail', inventoryDetail);
            
                            if (inventoryDetail) {
                                var binCount = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });
                                for (var k = 0; k < binCount; k++) {
                                    inventoryDetail.setSublistValue({
                                        sublistId: 'inventoryassignment',
                                        fieldId: 'quantity',
                                        line: k,
                                        value: roundedQty
                                    });
                                }
                            }
                        }
            
                        log.debug('Rounded line ' + j, 'Item: ' + componentItemId + ', From ' + qty + ' → ' + roundedQty);
                    }
                }
            }
            

            const confirmation = assemblyBuild.save();
            log.audit('Assembly Build Updated', 'Record ID: ' + confirmation);
        } catch (error) {
            log.error('afterSubmit error', error);
            throw error;
        }
    }

    function getItemRoundingCode(itemId) {
        const itemFields = search.lookupFields({
          type: search.Type.ITEM,
          id: itemId,
          columns: ['custitem_tc_item_build_rounding']
        });
    
        const roundCode = parseInt(itemFields.custitem_tc_item_build_rounding);
        return isNaN(roundCode) ? null : roundCode;
    }

    function getItemType(itemId) {
        const itemFields = search.lookupFields({
          type: search.Type.ITEM,
          id: itemId,
          columns: ['type']
        });
    
        return itemFields.type && itemFields.type.length > 0 ? itemFields.type[0].value : '';
    }

    return {
        afterSubmit: afterSubmit
    };
});
