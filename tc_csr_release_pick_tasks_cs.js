/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/search', 'N/record', 'N/ui/dialog', 'N/ui/message'], (search, record, dialog, message) => {
    const TASK_TYPE = 'customrecord_tc_csr_pick';
    const CSR_FIELD = 'custrecord_tc_csr_pt_csr';
    const STATUS_FIELD = 'custrecord_tc_csr_pt_status';
    const UNRELEASED = '1';
    const RELEASED = '2';
    let releasing = false;

    // Header 1 requires at least one non-cancelled task and all such tasks Released.
    // Cancelled tasks are excluded; no tasks or all Cancelled produce header 2.
    function syncCsrPickingStatus(csrId, csrType) {
        let taskCount = 0;
        let allReleased = true;
        search.create({
            type: 'customrecord_tc_csr_pick',
            filters: [['custrecord_tc_csr_pt_csr', 'anyof', csrId]],
            columns: [
                search.createColumn({ name: 'custrecord_tc_csr_pt_status', summary: search.Summary.GROUP }),
                search.createColumn({ name: 'internalid', summary: search.Summary.COUNT }),
                search.createColumn({ name: 'custitem_tc_is_crating_item', join: 'custrecord_tc_cst_pt_item', summary: search.Summary.GROUP })                
            ]
        }).run().each(result => {
            const count = Number(result.getValue({ name: 'internalid', summary: search.Summary.COUNT })) || 0;
            const status = result.getValue({ name: 'custrecord_tc_csr_pt_status', summary: search.Summary.GROUP });
            const cratingItem = result.getValue({ name: 'custitem_tc_is_crating_item', join: 'custrecord_tc_cst_pt_item', summary: search.Summary.GROUP });
            if (String(status) === '4') return true; // Ignore Cancelled tasks.
            taskCount += count;
            if (count && String(status) !== '2') allReleased = false;
            return true;
        });
        const target = taskCount > 0 && allReleased ? 1 : 2;
        const current = search.lookupFields({ type: csrType, id: csrId, columns: ['custbody_picking_status'] });
        const raw = current.custbody_picking_status;
        const currentValue = Array.isArray(raw) ? (raw[0] && raw[0].value) : raw;
        if (String(currentValue) !== String(target)) {
            record.submitFields({
                type: csrType,
                id: csrId,
                values: { custbody_picking_status: target },
                options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
        }
        return target;
    }

    async function ensureCratingPick(task, itemFlags) {
        const itemId = task.getValue({ fieldId: 'custrecord_tc_cst_pt_item' });
        if (!itemId) return false;
        if (!itemFlags[itemId]) {
            itemFlags[itemId] = search.lookupFields({
                type: search.Type.ITEM, id: itemId,
                columns: ['custitem_tc_is_crating_item', 'islotitem', 'isserialitem']
            });
        }
        const flags = itemFlags[itemId];
        const checked = value => value === true || value === 'T';
        if (!checked(flags.custitem_tc_is_crating_item)) return false;
        if (checked(flags.islotitem) || checked(flags.isserialitem)) {
            throw new Error('Crating item ' + itemId + ' requires lot/serial details and cannot be picked automatically.');
        }
        const required = Number(task.getValue({ fieldId: 'custrecord_tc_csr_pt_qty' }));
        if (!Number.isFinite(required) || required < 0) throw new Error('Invalid crating pick quantity.');
        const totals = search.create({
            type: 'customrecord_csr_pick_task_inventory_det',
            filters: [['custrecord_csr_pick_task', 'anyof', task.id]],
            columns: [search.createColumn({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })]
        }).run().getRange({ start: 0, end: 1 });
        const picked = totals.length ? Number(totals[0].getValue({ name: 'custrecord__lot_quantity', summary: search.Summary.SUM })) || 0 : 0;
        const remaining = Number((required - picked).toFixed(8));
        if (remaining <= 0) return false;

        const soId = task.getValue({ fieldId: 'custrecord_sales_order' });
        const lineId = task.getValue({ fieldId: 'custrecord_line_id' });
        const soPart = soId ? '_SO-' + soId : '';
        const linePart = lineId !== '' && lineId != null ? '_L-' + lineId : '';
        const detail = record.create({ type: 'customrecord_csr_pick_task_inventory_det', isDynamic: false });
        detail.setValue({ fieldId: 'name', value: 'PT-' + task.id + soPart + linePart + '_AUTO_CRATING_D-' + Date.now() });
        // A stable external ID stops two release clicks from saving the same top-up twice.
        detail.setValue({ fieldId: 'externalid', value: 'TC_CRATING_RELEASE_' + task.id + '_' + picked + '_' + required });
        detail.setValue({ fieldId: 'custrecord_csr_pick_task', value: task.id });
        detail.setValue({ fieldId: 'custrecord_item', value: itemId });
        detail.setValue({ fieldId: 'custrecord__lot_quantity', value: remaining });
        await detail.save.promise({ enableSourcing: false, ignoreMandatoryFields: false });
        return true;
    }

    function pageInit() {}

    async function releasePickTasks(csrId) {
        if (releasing) return;
        releasing = true;
        let progress;
        let released = 0;
        let skipped = 0;
        let cratingPicks = 0;
        const itemFlags = {};
        const failed = [];
        try {
            if (!/^\d+$/.test(String(csrId))) throw new Error('A saved CSR ID is required.');
            progress = message.create({
                title: 'Releasing pick tasks',
                message: 'Please keep this page open until the release finishes.',
                type: message.Type.INFORMATION
            });
            progress.show();

            // Snapshot every candidate before changing statuses; otherwise paging can skip tasks.
            const taskIds = [];
            const pages = search.create({
                type: TASK_TYPE,
                filters: [
                    [CSR_FIELD, 'anyof', String(csrId)], 'AND',
                    [STATUS_FIELD, 'anyof', UNRELEASED], 'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: [search.createColumn({ name: 'internalid', sort: search.Sort.ASC })]
            }).runPaged({ pageSize: 1000 });
            pages.pageRanges.forEach(range => {
                pages.fetch({ index: range.index }).data.forEach(result => taskIds.push(result.id));
            });

            for (const taskId of taskIds) {
                try {
                    // Reload immediately before the update. Record save uses optimistic locking
                    // (enabled on this custom record), protecting concurrent picker changes.
                    let task = await record.load.promise({ type: TASK_TYPE, id: taskId, isDynamic: false });
                    if (String(task.getValue({ fieldId: CSR_FIELD })) !== String(csrId) ||
                        String(task.getValue({ fieldId: STATUS_FIELD })) !== UNRELEASED ||
                        task.getValue({ fieldId: 'isinactive' }) === true ||
                        task.getValue({ fieldId: 'isinactive' }) === 'T') {
                        skipped++;
                        continue;
                    }
                    if (await ensureCratingPick(task, itemFlags)) cratingPicks++;
                    // Saving a child runs the quantity rollup User Event, which changes the
                    // parent task. Reload to avoid saving a stale parent record.
                    task = await record.load.promise({ type: TASK_TYPE, id: taskId, isDynamic: false });
                    if (String(task.getValue({ fieldId: CSR_FIELD })) !== String(csrId) ||
                        String(task.getValue({ fieldId: STATUS_FIELD })) !== UNRELEASED ||
                        task.getValue({ fieldId: 'isinactive' }) === true ||
                        task.getValue({ fieldId: 'isinactive' }) === 'T') {
                        skipped++;
                        continue;
                    }
                    task.setValue({ fieldId: STATUS_FIELD, value: RELEASED });
                    await task.save.promise({ enableSourcing: false, ignoreMandatoryFields: false });
                    released++;
                } catch (error) {
                    failed.push({ id: taskId, message: error.message || String(error) });
                }
            }
            syncCsrPickingStatus(csrId, 'customtransaction118');
            progress.hide();
            const failureText = failed.length
                ? '\nFailed tasks: ' + failed.slice(0, 10).map(f => f.id + ': ' + f.message).join('; ') +
                    (failed.length > 10 ? ' (additional failures omitted)' : '') + '\nReload and retry the remaining Unreleased tasks.'
                : '';
            await dialog.alert({
                title: failed.length ? 'Pick task release partially completed' : 'Pick task release complete',
                message: cratingPicks + ' crating pick detail(s) created. ' + released + ' task(s) released. ' + skipped + ' task(s) skipped because their status or CSR changed.' +
                    (taskIds.length === 0 ? '\nNo Unreleased pick tasks remain for this CSR.' : '') + failureText
            });
            window.location.reload();
        } catch (error) {
            if (progress) progress.hide();
            await dialog.alert({ title: 'Release or header update failed', message: released + ' task(s) were released before this error. ' + (error.message || String(error)) });
        } finally {
            releasing = false;
        }
    }

    return { pageInit, releasePickTasks };
});
