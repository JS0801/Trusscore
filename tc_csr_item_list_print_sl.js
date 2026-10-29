/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * Authenticated, internal RF-SMART label test tool. Deploy inside the target account.
 */
define(['N/ui/serverWidget', 'N/https', 'N/log', 'N/runtime', 'N/record', 'N/query'], (ui, https, log, runtime, record, query) => {
    function loadCsr(csrId) {
        const rec = record.load({ type: 'customtransaction118', id: id(csrId, 'CSR'), isDynamic: false });
        if (rec.getValue('custbody_ds_scrap_record')) throw new Error('CSR is cancelled.');
        const rows = query.runSuiteQL({ query: `SELECT l.id, BUILTIN.DF(l.custcol_tc_item) AS itemid,
            l.custcol_tc_item_qty AS quantity FROM TransactionLine l WHERE l.transaction = ?
            AND l.custcol_tc_item IS NOT NULL AND NVL(l.custcol_ds_remove, 'F') = 'F' ORDER BY l.id`,
            params: [Number(csrId)] }).asMappedResults();
        if (!rows.length) throw new Error('CSR has no active item lines.');
        if (rows.length > 120) throw new Error('This configuration test supports up to 120 CSR lines.');
        return { csrnumber: String(rec.getValue('tranid')), cratenumber: 'CSR', lines: rows };
    }
    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function id(value, label) {
        if (!/^[1-9]\d*$/.test(String(value || ''))) throw new Error(label + ' must be a positive internal ID.');
        return Number(value);
    }
    function flatten(input) {
        if (!Array.isArray(input) || !input.length || input.length > 20) throw new Error('Supply an array of 1–20 crates.');
        const pages = [];
        const text = (value, name, max) => {
            const s = String(value == null ? '' : value).trim();
            if (s.length > max || /[\r\n\x00-\x1f]/.test(s)) throw new Error('Invalid or oversized ' + name + '.');
            return s;
        };
        for (const crate of input) {
            if (!crate || typeof crate !== 'object') throw new Error('Invalid crate object.');
            const csr = text(crate.csrnumber, 'CSR number', 32);
            const number = text(crate.cratenumber, 'crate number', 24);
            const copies = Number(crate.printqty == null ? 1 : crate.printqty);
            if (!csr || !number) throw new Error('CSR and crate number are required.');
            if (!Number.isInteger(copies) || copies < 1 || copies > 20) throw new Error('Copies must be 1–20.');
            if (!Array.isArray(crate.lines) || !crate.lines.length || crate.lines.length > 120) throw new Error('Each crate needs 1–120 lines.');
            const count = Math.ceil(crate.lines.length / 12);
            for (let start = 0; start < crate.lines.length; start += 12) {
                const page = { csrnumber: csr, cratenumber: number,
                    netweight: text(crate.netweight, 'net weight', 12), grossweight: text(crate.grossweight, 'gross weight', 12),
                    printqty: String(copies), pagenumber: String(start / 12 + 1), pagecount: String(count) };
                for (let n = 1; n <= 12; n++) {
                    const line = crate.lines[start + n - 1];
                    page['item' + n] = ''; page['lot' + n] = ''; page['qty' + n] = '';
                    if (!line) continue;
                    const quantity = Number(line.quantity);
                    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Line quantities must be positive numbers.');
                    page['item' + n] = text(line.itemid, 'item', 34);
                    if (!page['item' + n]) throw new Error('Item is required on every line.');
                    page['lot' + n] = text(line.lotnumber || 'N/A', 'lot', 30);
                    page['qty' + n] = text(Number(quantity.toFixed(6)), 'quantity', 10);
                }
                pages.push(page);
            }
        }
        if (pages.reduce((sum, p) => sum + Number(p.printqty), 0) > 100) throw new Error('Limit each request to 100 physical labels including copies.');
        return pages;
    }
    function onRequest(context) {
        const p = context.request.parameters;
        let message = '', generated = '', failed = false, csr = null;
        const csrId = p.custpage_csr || p.csrId || '';
        if (csrId) {
            try { csr = loadCsr(csrId); } catch (e) { failed = true; message = e.message; log.error({title:'CSR_LOAD_FAILED', details:e}); }
        }
        const trace = 'RFTEST-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        if (context.request.method === 'POST') {
            let attempted = false;
            try {
                const templateId = 17;
                const printer = 101;
                if (!['test', 'print'].includes(p.custpage_mode)) throw new Error('Select an operation.');
                if (p.custpage_mode === 'print' && p.custpage_confirm !== 'T') throw new Error('Confirm physical printing before submitting.');
                if (!csr) throw new Error(message || 'Provide a valid CSR ID.');
                const dataSet = flatten([{ ...csr, printqty: p.custpage_copies || '1' }]);
                const options = { source: trace, templateId, printer, async: false,
                    processType: p.custpage_mode === 'print' ? 'GENERATE_BEFORE_SEND' : 'GENERATE_AND_RETURN', dataSet };
                log.audit({ title: trace + ' REQUEST', details: JSON.stringify({ account: runtime.accountId,
                    user: runtime.getCurrentUser().id, templateId, printer, processType: options.processType, pages: dataSet.length }) });
                log.debug({ title: trace + ' DATASET', details: JSON.stringify(dataSet).slice(0, 3900) });
                attempted = true;
                const response = https.requestRestlet({ scriptId: 'customscript_sit_lpc_rest_api',
                    deploymentId: 'customdeploy_sit_lpc_rest_api', method: https.Method.POST,
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ api: 'printLabels', options }) });
                let result;
                try { result = JSON.parse(response.body); } catch (_) { throw new Error('Non-JSON RF-SMART response; HTTP ' + response.code); }
                const payload = result.payload || {};
                log.audit({ title: trace + ' RESPONSE', details: JSON.stringify({ http: response.code,
                    success: result.success, message: result.message, code: result.code, apiRecId: payload.apiRecId, logId: payload.logId }).slice(0, 3900) });
                if (Number(response.code) < 200 || Number(response.code) >= 300 || result.success !== true) throw new Error(String(result.message || result.code || 'RF-SMART request failed.'));
                message = (p.custpage_mode === 'print' ? 'RF-SMART accepted the request. Physical delivery is not confirmed.' : 'Generation succeeded. Nothing sent to the printer.') +
                    '\nTrace: ' + trace + '\nAPI record: ' + (payload.apiRecId || 'not returned') + '\nPrint log: ' + (payload.logId || 'not returned');
                if (p.custpage_mode === 'test' && payload.file) generated = String(payload.file.content || '').slice(0, 100000);
            } catch (error) {
                failed = true;
                message = error.message + '\nTrace: ' + trace;
                if (attempted && p.custpage_mode === 'print') message += '\nSubmission may have occurred. Check RF-SMART logs before retrying.';
                log.error({ title: trace + ' FAILED', details: JSON.stringify({ message: error.message, stack: error.stack, attempted }).slice(0, 3900) });
            }
        }
        const form = ui.createForm({ title: 'Trusscore — CSR Item List Print Test' });
        const notice = form.addField({ id: 'custpage_notice', type: ui.FieldType.INLINEHTML, label: 'Instructions' });
        notice.defaultValue = '<p>Account: <b>' + escapeHtml(runtime.accountId) + '</b>. Template 17; printer 101 (Calg Zebra ZT410). Active CSR lines and required quantities. Test generation first.</p>' +
            (message ? '<pre style="white-space:pre-wrap;color:' + (failed ? '#b91c1c' : '#166534') + '">' + escapeHtml(message) + '</pre><p>Do not refresh this submitted page; refreshing can resubmit the request.</p>' : '');
        function field(key, label, type, value, mandatory) {
            const f = form.addField({ id: key, label, type }); f.defaultValue = value || ''; f.isMandatory = !!mandatory; return f;
        }
        field('custpage_csr', 'CSR internal ID', ui.FieldType.INTEGER, csrId, true);
        field('custpage_copies', 'Copies (1–20)', ui.FieldType.INTEGER, p.custpage_copies || '1', true);
        const mode = field('custpage_mode', 'Operation', ui.FieldType.SELECT);
        mode.addSelectOption({ value: 'test', text: 'Test generation — no physical print', isSelected: true });
        mode.addSelectOption({ value: 'print', text: 'Send to physical printer' });
        field('custpage_confirm', 'I intend to send these labels to the selected physical printer', ui.FieldType.CHECKBOX, 'F');
        if (csr) {
            field('custpage_review', 'CSR item list', ui.FieldType.INLINEHTML).defaultValue =
                '<h3>' + escapeHtml(csr.csrnumber) + '</h3><table border="1" cellpadding="6"><tr><th>Item</th><th>Required qty</th></tr>' +
                csr.lines.map(l => '<tr><td>' + escapeHtml(l.itemid) + '</td><td>' + escapeHtml(l.quantity) + '</td></tr>').join('') + '</table>';
        }
        if (generated) field('custpage_generated', 'Generated output (first 100,000 characters)', ui.FieldType.LONGTEXT, generated)
            .updateDisplayType({ displayType: ui.FieldDisplayType.READONLY });
        form.addSubmitButton({ label: 'Run selected operation' });
        context.response.writePage(form);
    }
    return { onRequest };
});
