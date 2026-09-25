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

    function pageInit() {}

    async function releasePickTasks(csrId) {
        if (releasing) return;
        releasing = true;
        let progress;
        let released = 0;
        let skipped = 0;
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
                    const task = await record.load.promise({ type: TASK_TYPE, id: taskId, isDynamic: false });
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
            progress.hide();
            const failureText = failed.length
                ? '\nFailed tasks: ' + failed.slice(0, 10).map(f => f.id + ': ' + f.message).join('; ') +
                    (failed.length > 10 ? ' (additional failures omitted)' : '') + '\nReload and retry the remaining Unreleased tasks.'
                : '';
            await dialog.alert({
                title: failed.length ? 'Pick task release partially completed' : 'Pick task release complete',
                message: released + ' task(s) released. ' + skipped + ' task(s) skipped because their status or CSR changed.' +
                    (taskIds.length === 0 ? '\nNo Unreleased pick tasks remain for this CSR.' : '') + failureText
            });
            window.location.reload();
        } catch (error) {
            if (progress) progress.hide();
            await dialog.alert({ title: 'Unable to release pick tasks', message: error.message || String(error) });
        } finally {
            releasing = false;
        }
    }

    return { pageInit, releasePickTasks };
});
