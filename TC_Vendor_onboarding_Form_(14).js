/**
* @NApiVersion 2.1
* @NScriptType Suitelet
*/
define(['N/ui/serverWidget', 'N/log', 'N/record', 'N/file', 'N/search', 'N/email', 'N/crypto', 'N/encode', 'N/render'],
    function (serverWidget, log, record, file, search, email, crypto, encode, render) {

        var PASSPHRASE = 'trusscore';
        var DRAFT_FIELD = 'custrecord_draft_';
        // ===== PDF CONFIG =====
        var PDF_FOLDER_ID = 291182;
        var PDF_FIELD_ID = 'custrecord_vendor_pdf'; // FILE field on customrecord_vendor_onboarding (change to your field id)
        var COMPANY_LOGO_URL = 'https://6518122.app.netsuite.com/core/media/media.nl?id=6122&c=6518122&h=m6_0Vrb_g_AphBfET8BOfpOVIeIbop4Sotx3jZo2T1ewbnzh';

        function escXml(s) {
            if (s == null) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function grabStateName(id) {
          var stateName = '';
          if (!id) return stateName;

const stateSearchObj = search.create({
   type: "state",
   filters:
   [
      ["id","equalto",id]
   ],
   columns:
   [
      search.createColumn({name: "fullname", label: "Full Name"})
   ]
});
const searchResultCount = stateSearchObj.runPaged().count;
stateSearchObj.run().each(function(result){
   stateName = result.getValue({name: "fullname"})
   return true;
});

          return stateName;
        }

        // --- REPLACE buildPdfXml WITH THIS VERSION ---
        function buildPdfXml(recId, data) {
            function val(v) { return (v == null ? '' : String(v)); }
            function row(k, v, odd) { return '<tr class="' + (odd ? 'odd' : '') + '"><td class="k">' + escXml(k) + '</td><td class="v">' + escXml(v || '—') + '</td></tr>'; }
            function fmtPhone(p, ext) {
                var base = (val(p).trim() ? val(p).trim() : '');
                var e = (val(ext).trim() ? ' Ext ' + val(ext).trim() : '');
                return base ? (base + e) : '';
            }

            // Vendor type + individual names (if selected)
            var vendorType = (String(data.vendor_type) === '2') ? 'Individual' : 'Company';
            var indRows = (String(data.vendor_type) === '2')
                ? row('First Name', data.first_name, true) + row('Last Name', data.last_name, false)
                : '';

            // Payment-method rows
            var pm = String((data.payment_method || '')).toUpperCase();
            var pmRows = '';
            if (pm === 'EFT') {
                pmRows += row('Payment Method', 'EFT (CAD)', true);
                pmRows += row('Account Name', data.eft_account_name, false);
                pmRows += row('Account Number', data.eft_account_number, true);
                pmRows += row('Institution #', data.eft_inst_number, false);
                pmRows += row('Transit #', data.eft_transit_number, true);

            } else if (pm === 'ACH') {
                pmRows += row('Payment Method', 'ACH (USD)', true);
                pmRows += row('Legal Name on Account', data.ach_account_name, false);
                pmRows += row('Bank Account Type', data.bank_account_type, true);
                pmRows += row('ACH Bank Name', data.ach_bank_name, false);
                pmRows += row('ACH Bank Address', data.ach_bank_address, true);
                pmRows += row('Account Number / IBAN', data.ach_account_number, false);
                pmRows += row('Swift / BIC', data.ach_swift, true);
                pmRows += row('ABA / Routing', data.ach_aba, false);

            } else if (pm === 'WIRE') {
                pmRows += row('Payment Method', 'WIRE', true);
                pmRows += row('Currency', data.wire_currency, false);
                pmRows += row('Legal Name on Account', data.wire_account_name, true);
                pmRows += row('Wire Bank Name', data.wire_bank_name, false);
                pmRows += row('Account Number / IBAN', data.wire_account_number, true);
                pmRows += row('Swift / BIC', data.wire_swift, false);
                pmRows += row('ABA / Routing', data.wire_aba, true);

            } else if (pm === 'OTHER') {
                pmRows += row('Payment Method', 'Other', true);
                pmRows += row('Details', data.other_payment_text, false);

            } else {
                pmRows += row('Payment Method', pm || '—', true);
            }

            // Mailing block (optional)
            var hasMailing = !!(data.mail_street || data.mail_po_box || data.mail_city || data.mail_state || data.mail_zip || data.mail_country);
            var mailingBlock = !hasMailing ? '' :
                '<tr><td class="pad">' +
                '<table class="sec-titlebar"><tr><td class="pad"><span class="sec-title">Mailing Address</span> &nbsp;<span class="sec-pill">Alternate</span></td></tr></table>' +
                '<table class="data">' +
                row('Street', data.mail_street, true) +
                row('PO Box', data.mail_po_box, false) +
                row('City', data.mail_city, true) +
                row('State/Province', data.mail_state, false) +
                row('Postal/ZIP', data.mail_zip, true) +
                row('Country', data.mail_country, false) +
                '</table>' +
                '</td></tr><tr><td class="sep"></td></tr>';

            return (
                '<?xml version="1.0"?>\
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\
<pdf>\
  <head>\
    <style type="text/css">\
      body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color:#0f172a }\
      table { width: 100%; border-collapse: collapse; }\
      .outer { width: 100%; }\
      .pad   { padding: 14pt; }\
      .sep   { height: 8pt }\
      /* Header */\
      .hdr-bg { background-color:#fcac16; color:#ffffff; }\
      .hdr h1 { margin:0; font-size:15pt; letter-spacing:.2pt }\
      .logo { width: 250px; height: 70px; } /* reliable size for BFO */\
      .ref  { font-size:9pt; color:#fff; opacity:.95 }\
      .pill { display:inline-block; background:#fff7e6; color:#b45309; font-weight:bold; padding:3pt 7pt; border-radius:999pt; font-size:8.5pt }\
      /* Sections */\
      .sec-titlebar { background:#f8fafc; border:0.5pt solid #e5e7eb }\
      .sec-title { font-size:11pt; color:#111827; font-weight:bold; }\
      .sec-pill  { background:#e0f2fe; color:#075985; padding:2pt 6pt; border-radius:999pt; font-size:8pt; font-weight:bold }\
      /* Data tables */\
      .data { border:0.5pt solid #e5e7eb; }\
      .data tr { border-bottom:0.5pt solid #eef2f7 }\
      .data tr:last-child { border-bottom:none }\
      .data td { padding:7pt 6pt; vertical-align:top }\
      .data .k  { width: 190pt; color:#475569; font-weight:bold }\
      .data .v  { color:#0f172a }\
      .data tr.odd { background:#fafafa }\
      /* Footnote */\
      .foot td { color:#64748b; font-size:8.5pt }\
    </style>\
  </head>\
  <body>\
    <table class="outer">\
      <!-- HEADER -->\
      <tr><td class="pad hdr-bg">\
        <table class="hdr">\
          <tr>\
            <td><h1>Vendor Onboarding</h1><span class="pill">Confirmation</span></td>\
            <td align="right">' + (COMPANY_LOGO_URL ? '<img class="logo" src="' + escXml(COMPANY_LOGO_URL) + '"/>' : '') + '</td>\
          </tr>\
          <tr><td colspan="2" class="ref">Reference #: ' + escXml(recId) + '</td></tr>\
        </table>\
      </td></tr>\
      <tr><td class="sep"></td></tr>\
      <!-- Vendor -->\
      <tr><td class="pad">\
        <table class="sec-titlebar"><tr><td class="pad"><span class="sec-title">Vendor Details</span> &nbsp;<span class="sec-pill">Profile</span></td></tr></table>\
        <table class="data">' +
                row('Legal Company Name', data.legal_company_name, true) +
                row('DBA Name', data.dba_name, false) +
                row('Type', vendorType, true) + indRows +
                row('Business Number / TIN', data.business_number, false) +
                row('Website', data.website, true) +
                row('Street', data.street_address, false) +
                row('PO Box', data.po_box, true) +
                row('City', data.city, false) +
                row('State/Province', data.state, true) +
                row('Postal/ZIP', data.zip, false) +
                row('Country', data.ven_country, true) +
                '</table>\
      </td></tr>\
      <tr><td class="sep"></td></tr>' +
                mailingBlock +
                '<tr><td class="pad">\
        <table class="sec-titlebar"><tr><td class="pad"><span class="sec-title">Contacts</span> &nbsp;<span class="sec-pill">Primary</span></td></tr></table>\
        <table class="data">' +
                row('Purchasing Contact', [data.purch_contact_name, data.purch_title].filter(Boolean).join(' – '), true) +
                row('Purchasing Email', data.purch_email, false) +
                row('Purchasing Phone', fmtPhone(data.purch_phone, data.purch_ext) || '', true) +
                row('Purchasing Alt Phone', fmtPhone(data.purch_alt_phone, data.purch_alt_ext) || '', false) +
                row('Accounting Contact', [data.acc_contact_name, data.acc_title].filter(Boolean).join(' – '), true) +
                row('Accounting Email', data.acc_email, false) +
                row('Accounting Phone', fmtPhone(data.acc_phone, data.acc_ext) || '', true) +
                row('Accounting Alt Phone', fmtPhone(data.acc_alt_phone, data.acc_alt_ext) || '', false) +
                '</table>\
      </td></tr>\
      <tr><td class="sep"></td></tr>\
      <!-- Bank & Payment -->\
      <tr><td class="pad">\
        <table class="sec-titlebar"><tr><td class="pad"><span class="sec-title">Bank &amp; Payment</span> &nbsp;<span class="sec-pill">Finance</span></td></tr></table>\
        <table class="data">' +
                row('Bank Name', data.bank_name, true) +
                row('Bank Address', data.bank_address, false) +
                row('PO Box', data.bank_po_box, true) +
                row('City / State / ZIP', [data.bank_city, data.bank_state, data.bank_zip].filter(Boolean).join(', '), false) +
                row('Country', data.bank_country, true) +
                row('Branch Telephone', data.branch_telephone, false) +
                row('Bank Contact', data.bank_contact, true) +
                row('Bank Contact Email', data.bank_contact_email, false) +
                row('Payment Terms', data.payment_terms_name || data.payment_terms, true) +
                row('Other Terms', data.payment_other, false) +
                row('Remittance Email', data.remit_email, true) +
                '</table>\
        <table class="data" style="margin-top:8pt">' + pmRows + '</table>\
      </td></tr>\
      <tr><td class="sep"></td></tr>\
      <!-- Authorization -->\
      <tr><td class="pad">\
        <table class="sec-titlebar"><tr><td class="pad"><span class="sec-title">Authorization</span> &nbsp;<span class="sec-pill">Sign-off</span></td></tr></table>\
        <table class="data">' +
                row('Name', data.auth_name, true) +
                row('Title', data.auth_title, false) +
                row('Date', data.auth_date, true) +
                row('Digital Signature', data.auth_signature, false) +
                row('Confirmation Email', data.auth_email, true) +
                row('Trusscore Contact Email', data.auth_tc_email, false) +
                '</table>\
      </td></tr>\
      <tr><td class="sep"></td></tr>\
      <!-- FOOTER NOTE -->\
      <tr class="foot"><td class="pad">\
        <table><tr><td>This PDF was generated automatically upon submission and saved to the vendor onboarding record. Colors: brand orange #fcac16; accents use subtle blues/grays for hierarchy.</td></tr></table>\
      </td></tr>\
    </table>\
  </body>\
</pdf>'
            );
        }

        // --- REPLACE createAndAttachPdf WITH THIS VERSION ---
        function createAndAttachPdf(recId, req) {
            try {
                // Load saved record to fill any blanks that weren't in req.parameters
                var r = record.load({ type: 'customrecord_vendor_onboarding', id: recId, isDynamic: false });

                // look up Payment Term name if we have an internal id
                var paymentTermId = (req.parameters.payment_terms || r.getValue('custrecord_vendor_payment_terms')) || '';
                var paymentTermName = '';
                try {
                    if (paymentTermId) {
                        var f = search.lookupFields({
                            type: search.Type.TERM,
                            id: String(paymentTermId),
                            columns: ['name']
                        });
                        paymentTermName = (f && f.name) || '';
                    }
                } catch (e) { log.debug('lookup term name failed', e); }

                function pref(pField, recField, text) {
                    // prefer POST parameter; fall back to record (getText if requested)
                    if (req && req.parameters && req.parameters[pField] != null && req.parameters[pField] !== '' && !text) return req.parameters[pField];
                    return text ? r.getText(recField) : r.getValue(recField);
                }

                // Build unified data object used by buildPdfXml
                var data = {
                    // Vendor
                    legal_company_name: pref('legal_company_name', 'custrecord_vendor_legal_name'),
                    dba_name: pref('dba_name', 'custrecord_vendor_dba'),
                    vendor_type: pref('vendor_type', 'custrecord_vendor_type'),
                    first_name: pref('first_name', 'custrecord_first_name'),
                    last_name: pref('last_name', 'custrecord_last_name'),
                    business_number: pref('business_number', 'custrecord_vendor_tin'),
                    website: pref('website', 'custrecord_vendor_website'),
                    street_address: pref('street_address', 'custrecord_vendor_street'),
                    po_box: pref('po_box', 'custrecord_vendor_po_box'),
                    city: pref('city', 'custrecord_vendor_city'),
                    state: pref('state', 'custrecord_vendor_state', true),
                    zip: pref('zip', 'custrecord_vendor_zip'),
                    ven_country: pref('ven_country', 'custrecord_vendor_country', true),

                    // Mailing
                    mail_street: pref('mail_street', 'custrecord_vendor_mail_street'),
                    mail_po_box: pref('mail_po_box', 'custrecord_vendor_mail_po_box'),
                    mail_city: pref('mail_city', 'custrecord_vendor_mail_city'),
                    mail_state: pref('mail_state', 'custrecord_vendor_mail_state', true),
                    mail_zip: pref('mail_zip', 'custrecord_vendor_mail_zip'),
                    mail_country: pref('ven_mail_country', 'custrecord_vendor_mail_country', true),

                    // Contacts
                    purch_contact_name: pref('purch_contact_name', 'custrecord_vendor_purch_name'),
                    purch_title: pref('purch_title', 'custrecord_vendor_purch_title'),
                    purch_email: pref('purch_email', 'custrecord_vendor_purch_email'),
                    purch_phone: pref('purch_phone', 'custrecord_vendor_purch_phone'),
                    purch_ext: pref('purch_ext', 'custrecord_vendor_purch_ext'),
                    purch_alt_phone: pref('purch_alt_phone', 'custrecord_vendor_purch_alt_phone'),
                    purch_alt_ext: pref('purch_alt_ext', 'custrecord_vendor_purch_alt_ext'),
                    acc_contact_name: pref('acc_contact_name', 'custrecord_vendor_acc_name'),
                    acc_title: pref('acc_title', 'custrecord_vendor_acc_title'),
                    acc_email: pref('acc_email', 'custrecord_vendor_acc_email'),
                    acc_phone: pref('acc_phone', 'custrecord_vendor_acc_phone'),
                    acc_ext: pref('acc_ext', 'custrecord_vendor_acc_ext'),
                    acc_alt_phone: pref('acc_alt_phone', 'custrecord_vendor_acc_alt_phone'),
                    acc_alt_ext: pref('acc_alt_ext', 'custrecord_vendor_acc_alt_ext'),

                    // Bank & payment
                    bank_name: pref('bank_name', 'custrecord_vendor_bank_name'),
                    bank_address: pref('bank_address', 'custrecord_vendor_bank_address'),
                    bank_po_box: pref('bank_po_box', 'custrecord_vendor_bank_po_box'),
                    bank_city: pref('bank_city', 'custrecord_vendor_bank_city'),
                    bank_state: pref('bank_state', 'custrecord_vendor_bank_state', true),
                    bank_zip: pref('bank_zip', 'custrecord_vendor_bank_zip'),
                    bank_country: pref('bank_country', 'custrecord_vendor_bank_country', true),
                    branch_telephone: pref('branch_telephone', 'custrecord_vendor_branch_phone'),
                    bank_contact: pref('bank_contact', 'custrecord_vendor_bank_contact'),
                    bank_contact_email: pref('bank_contact_email', 'custrecord_vendor_bank_contact_email'),
                    payment_terms: paymentTermId,
                    payment_terms_name: paymentTermName,
                    payment_other: pref('payment_other', 'custrecord_vendor_other_terms'),
                    remit_email: pref('remit_email', 'custrecord_vendor_remit_email'),

                    payment_method: (function () {
                        if (req && req.parameters && req.parameters.payment_method) return req.parameters.payment_method;
                        var txt = r.getText('custrecord_vendor_payment_method');
                        return txt || r.getValue('custrecord_vendor_payment_method') || '';
                    })(),

                    // EFT
                    eft_account_name: pref('eft_account_name', 'custrecord_vendor_eft_name'),
                    eft_account_number: pref('eft_account_number', 'custrecord_vendor_eft_account'),
                    eft_inst_number: pref('eft_inst_number', 'custrecord_vendor_eft_inst'),
                    eft_transit_number: pref('eft_transit_number', 'custrecord_vendor_eft_transit'),

                    // ACH
                    ach_account_name: pref('ach_account_name', 'custrecord_vendor_ach_name'),
                    ach_bank_name: pref('ach_bank_name', 'custrecord_vendor_ach_bank'),
                    ach_bank_address: pref('ach_bank_address', 'custrecord_vendor_ach_address'),
                    ach_account_number: pref('ach_account_number', 'custrecord_vendor_ach_account'),
                    ach_swift: pref('ach_swift', 'custrecord_vendor_ach_swift'),
                    ach_aba: pref('ach_aba', 'custrecord_vendor_ach_aba'),
                    ach_iban: pref('ach_iban', 'custrecord_vendor_ach_iban'),
                    bank_account_type: (function () {
                        if (req && req.parameters && req.parameters.bank_account_type) return req.parameters.bank_account_type;
                        return r.getText('custrecord_ach_bank_type') || r.getValue('custrecord_ach_bank_type') || '';
                    })(),

                    // Wire
                    wire_currency: pref('wire_currency', 'custrecord_vendor_wire_currency'),
                    wire_account_name: pref('wire_account_name', 'custrecord_vendor_wire_name'),
                    wire_bank_name: pref('wire_bank_name', 'custrecord_vendor_wire_bank'),
                    wire_account_number: pref('wire_account_number', 'custrecord_vendor_wire_account'),
                    wire_swift: pref('wire_swift', 'custrecord_vendor_wire_swift'),
                    wire_aba: pref('wire_aba', 'custrecord_vendor_wire_aba'),
                    wire_iban: pref('wire_iban', 'custrecord_vendor_wire_iban'),

                    // Other payment text
                    other_payment_text: pref('other_payment_text', 'custrecord_vendor_other'),

                    // Authorization
                    auth_name: pref('auth_name', 'custrecord_vendor_auth_name'),
                    auth_title: pref('auth_title', 'custrecord_vendor_auth_title'),

                    auth_date: (function () {
                        if (req && req.parameters && req.parameters.auth_date) return req.parameters.auth_date;
                        var d = r.getValue('custrecord_vendor_auth_date');
                        return d ? toISODate(d) : '';
                    })(),
                    auth_signature: pref('auth_signature', 'custrecord_vendor_signature'),
                    auth_email: pref('auth_email', 'custrecord_vendor_auth_email'),
                    auth_tc_email: pref('auth_email', 'custrecord_vendor_auth_tc_email'),
                };

                var renderer = render.create();
                renderer.templateContent = buildPdfXml(recId, data);

                var pdfFile = renderer.renderAsPdf();
                pdfFile.name = 'Vendor_Onboarding_' + recId + '.pdf';
                pdfFile.folder = PDF_FOLDER_ID;
                var fileId = pdfFile.save();
                log.audit('PDF generated', { recId: recId, fileId: fileId });

                if (PDF_FIELD_ID) {
                    var recToUpdate = record.load({ type: 'customrecord_vendor_onboarding', id: recId, isDynamic: false });
                    recToUpdate.setValue({ fieldId: PDF_FIELD_ID, value: fileId });
                    recToUpdate.save({ ignoreMandatoryFields: true });
                }

                return fileId;
            } catch (e) {
                log.error('PDF generation failed', e);
                return null;
            }
        }



        function countryOptions(selected) {
            // `selected` can be country NAME or CODE
            var list = [
                { code: 'CA', name: 'Canada' },
                { code: 'US', name: 'United States' },
                { code: 'MX', name: 'Mexico' },
                { code: 'GB', name: 'United Kingdom' }, // use GB not UK (NetSuite uses GB)
                { code: 'LC', name: 'Saint Lucia' },
                { code: 'PR', name: 'Puerto Rico' },
                { code: 'GY', name: 'Guyana' },
                { code: 'CL', name: 'Chile' },
                { code: 'BB', name: 'Barbados' },
                { code: 'CN', name: 'China' }
            ];

            function escOpt(s) {
                return String(s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }

            var selNorm = String(selected || '').toLowerCase();
            var html = '<option value="">Select</option>';

            list.forEach(function (c) {
                var isSelected =
                    selNorm === c.name.toLowerCase() ||
                    selNorm === c.code.toLowerCase();
                html += '<option value="' + escOpt(c.name) + '"' + (isSelected ? ' selected' : '') + '>' +
                    escOpt(c.name) + '</option>';
            });
            return html;
        }


        // Derive a small 32-bit key from the passphrase (first 4 bytes of SHA-256)
        function keyInt32() {
            var h = crypto.createHash({ algorithm: crypto.HashAlg.SHA256 });
            h.update({ input: PASSPHRASE });
            var hex = h.digest({ outputEncoding: encode.Encoding.HEX }); // 64 hex chars
            // first 8 hex chars -> 32-bit unsigned int
            return parseInt(hex.slice(0, 8), 16) >>> 0;
        }

        // URL-safe Base64 helpers
        function b64url(s) { return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
        function b64fromUrl(s) { var t = s.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return t; }

        // Encode internal ID -> token
        function encodeId(idNum) {
            var k = keyInt32();
            var n = (Number(idNum) ^ k) >>> 0;                        // XOR with key
            var hex = ('00000000' + n.toString(16)).slice(-8);        // 8 hex chars
            var b64 = encode.convert({ string: hex, inputEncoding: encode.Encoding.HEX, outputEncoding: encode.Encoding.BASE_64 });
            return b64url(b64);                                       // URL-safe
        }

        // Decode token -> internal ID (or null if bad)
        function decodeToken(tok) {
            try {
                if (!tok) return null;
                var b64 = b64fromUrl(tok);
                var hex = encode.convert({ string: b64, inputEncoding: encode.Encoding.BASE_64, outputEncoding: encode.Encoding.HEX });
                var n = parseInt(hex, 16) >>> 0;
                var k = keyInt32();
                return (n ^ k) >>> 0;                                   // original ID
            } catch (e) {
                log.debug('decodeToken failed', e);
                return null;
            }
        }



        function esc(v) {
            return (v == null ? '' : String(v))
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        function toISODate(d) {
            try {
                if (!d) return '';
                var dt = (d instanceof Date) ? d : new Date(d);
                if (isNaN(dt.getTime())) return '';
                var m = (dt.getMonth() + 1).toString().padStart(2, '0');
                var day = dt.getDate().toString().padStart(2, '0');
                return dt.getFullYear() + '-' + m + '-' + day;
            } catch (e) { return ''; }
        }
        var FORM_BASE_URL = 'https://6518122.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=5804&deploy=1&compid=6518122&ns-at=AAEJ7tMQi6u9BSsGXBpBYNAigeywBkbWHEZcIMttBNGYZM87sqY';

        // Replace your existing writeMsgAndExit with this prettier version
        function writeMsgAndExit(ctx, title, msg) {
            var html =
                '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                '<title>' + esc(title) + '</title>' +
                '<style>' +
                'html,body{height:100%;margin:0;font-family:Arial,Helvetica,sans-serif;background:linear-gradient(135deg,#eef2ff 0%,#f8fafc 60%,#ffffff 100%);color:#0f172a}' +
                '.wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}' +
                '.card{max-width:720px;width:100%;background:#ffffff;border-radius:16px;box-shadow:0 18px 40px rgba(2,6,23,.08);overflow:hidden;border:1px solid #e5e7eb}' +
                '.hdr{display:flex;gap:16px;align-items:center;padding:22px 24px;background:linear-gradient(135deg,#fef3c7,#fde68a);border-bottom:1px solid #f5d48d}' +
                '.ic{width:44px;height:44px;border-radius:999px;display:grid;place-items:center;background:#fff7ed;border:1px solid #fed7aa}' +
                '.ic svg{width:22px;height:22px;color:#b45309}' +
                '.hdr h1{margin:0;font-size:20px;color:#92400e}' +
                '.body{padding:22px 24px;font-size:15px;line-height:1.55;color:#334155}' +
                '.hint{margin-top:12px;color:#64748b}' +
                '.cta{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:18px 24px;background:#f8fafc;border-top:1px solid #e5e7eb}' +
                '.btn{display:inline-block;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;border:1px solid transparent}' +
                '.btn.primary{background:#0ea5e9;color:#fff;border-color:#0ea5e9}' +
                '.btn.primary:hover{background:#0284c7;border-color:#0284c7}' +
                '.btn.ghost{background:#ffffff;color:#0f172a;border-color:#cbd5e1}' +
                '.btn.ghost:hover{background:#f1f5f9}' +
                '</style></head><body><div class="wrap">' +
                '<div class="card">' +
                '<div class="hdr">' +
                '<div class="ic">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
                '<line x1="12" y1="9" x2="12" y2="13"></line>' +
                '<line x1="12" y1="17" x2="12" y2="17"></line>' +
                '</svg>' +
                '</div>' +
                '<h1>' + esc(title) + '</h1>' +
                '</div>' +
                '<div class="body">' +
                '<p>' + esc(msg) + '</p>' +
                '<p class="hint">If you need help, contact <a href="mailto:ap@trusscore.com">ap@trusscore.com</a>.</p>' +
                '</div>' +
                '<div class="cta">' +
                '<a class="btn primary" href="' + esc(FORM_BASE_URL) + '">Start a new form</a>' +
                // '<a class="btn ghost" href="mailto:ap@trusscore.com?subject='+encodeURIComponent('Help with vendor onboarding draft link')+'">Email AP team</a>'+
                '</div>' +
                '</div>' +
                '</div></body></html>';

            ctx.response.write(html);
        }

        function onRequest(context) {
            if (context.request.method === 'GET') {
                try {


                    var form = serverWidget.createForm({ title: 'Vendor Onboarding Form' });
                    var htmlField = form.addField({
                        id: 'custpage_vendor_html',
                        label: ' ',
                        type: serverWidget.FieldType.INLINEHTML
                    });

                    // Parse recid from URL to support resume/prefill
                    var tok = context.request.parameters.t || context.request.parameters.token || '';
                    var existingIdFromUrl = tok ? decodeToken(tok) : '';

                    if (tok && !existingIdFromUrl) {
                        writeMsgAndExit(context, 'Draft link not valid', 'We could not find any related form details.');
                        return;
                    }

                    var ex = {}; // existing values (for prefill)
                    var existingFiles = { bank: null, w9: null, ins: null, wc: null }; // {id,name,url,size}

                    var recField = form.addField({
                        id: 'custpage_record_id',
                        label: 'Record ID',
                        type: serverWidget.FieldType.TEXT
                    });

                    recField.updateDisplayType({
                        displayType: serverWidget.FieldDisplayType.HIDDEN
                    });

                    if (existingIdFromUrl) {
                        recField.defaultValue = existingIdFromUrl;
                        try {
                            var rec = record.load({ type: 'customrecord_vendor_onboarding', id: existingIdFromUrl, isDynamic: true });
                            var isDraftStillOpen = !!rec.getValue(DRAFT_FIELD);
                            if (!isDraftStillOpen) {
                                writeMsgAndExit(context, 'This draft is already processed', 'The form has already been submitted/processed.');
                                return;
                            }
                            // Vendor
                            ex.legal_company_name = rec.getValue('custrecord_vendor_legal_name');
                            ex.dba_name = rec.getValue('custrecord_vendor_dba');
                            ex.business_number = rec.getValue('custrecord_vendor_tin');
                            ex.website = rec.getValue('custrecord_vendor_website');
                            ex.street_address = rec.getValue('custrecord_vendor_street');
                            ex.po_box = rec.getValue('custrecord_vendor_po_box');
                            ex.city = rec.getValue('custrecord_vendor_city');
                            ex.state = rec.getValue('custrecord_vendor_state');
                            ex.zip = rec.getValue('custrecord_vendor_zip');
                            ex.country = rec.getText('custrecord_vendor_country');
                            ex.vendor_type = rec.getValue('custrecord_vendor_type');         // 1 = Company, 2 = Individual
                            ex.first_name = rec.getValue('custrecord_first_name') || '';
                            ex.last_name = rec.getValue('custrecord_last_name') || '';

                            // Mailing
                            ex.mail_street = rec.getValue('custrecord_vendor_mail_street');
                            ex.mail_po_box = rec.getValue('custrecord_vendor_mail_po_box');
                            ex.mail_city = rec.getValue('custrecord_vendor_mail_city');
                            ex.mail_state = rec.getValue('custrecord_vendor_mail_state');
                            ex.mail_zip = rec.getValue('custrecord_vendor_mail_zip');
                            ex.mail_country = rec.getText('custrecord_vendor_mail_country');

                            // Purchasing
                            ex.purch_contact_name = rec.getValue('custrecord_vendor_purch_name');
                            ex.purch_title = rec.getValue('custrecord_vendor_purch_title');
                            ex.purch_phone = rec.getValue('custrecord_vendor_purch_phone');
                            ex.purch_ext = rec.getValue('custrecord_vendor_purch_ext');
                            ex.purch_alt_phone = rec.getValue('custrecord_vendor_purch_alt_phone');
                            ex.purch_alt_ext = rec.getValue('custrecord_vendor_purch_alt_ext');
                            ex.purch_email = rec.getValue('custrecord_vendor_purch_email');

                            // Accounting
                            ex.acc_contact_name = rec.getValue('custrecord_vendor_acc_name');
                            ex.acc_title = rec.getValue('custrecord_vendor_acc_title');
                            ex.acc_phone = rec.getValue('custrecord_vendor_acc_phone');
                            ex.acc_ext = rec.getValue('custrecord_vendor_acc_ext');
                            ex.acc_alt_phone = rec.getValue('custrecord_vendor_acc_alt_phone');
                            ex.acc_alt_ext = rec.getValue('custrecord_vendor_acc_alt_ext');
                            ex.acc_email = rec.getValue('custrecord_vendor_acc_email');

                            // Bank & Payment
                            ex.bank_name = rec.getValue('custrecord_vendor_bank_name');
                            ex.bank_address = rec.getValue('custrecord_vendor_bank_address');
                            ex.bank_po_box = rec.getValue('custrecord_vendor_bank_po_box');
                            ex.bank_city = rec.getValue('custrecord_vendor_bank_city');
                            ex.bank_state = rec.getValue('custrecord_vendor_bank_state');
                            ex.bank_zip = rec.getValue('custrecord_vendor_bank_zip');
                            ex.bank_country = rec.getText('custrecord_vendor_bank_country');
                            ex.branch_telephone = rec.getValue('custrecord_vendor_branch_phone');
                            ex.bank_contact = rec.getValue('custrecord_vendor_bank_contact');
                            ex.bank_contact_email = rec.getValue('custrecord_vendor_bank_contact_email');

                            ex.payment_terms = rec.getValue('custrecord_vendor_payment_terms'); // internalid
                            ex.payment_other = rec.getValue('custrecord_vendor_other_terms');
                            ex.remit_email = rec.getValue('custrecord_vendor_remit_email');

                            // Payment method + details
                            ex.payment_method = rec.getText('custrecord_vendor_payment_method') || rec.getValue('custrecord_vendor_payment_method');
                            ex.other_payment_text = rec.getValue('custrecord_vendor_other') || '';
                            // EFT
                            ex.eft_account_name = rec.getValue('custrecord_vendor_eft_name');
                            ex.eft_account_number = rec.getValue('custrecord_vendor_eft_account');
                            ex.eft_inst_number = rec.getValue('custrecord_vendor_eft_inst');
                            ex.eft_transit_number = rec.getValue('custrecord_vendor_eft_transit');

                            // ACH
                            ex.ach_account_name = rec.getValue('custrecord_vendor_ach_name');
                            ex.ach_bank_name = rec.getValue('custrecord_vendor_ach_bank');
                            ex.ach_bank_type = rec.getValue('custrecord_ach_bank_type');

                            ex.ach_bank_address = rec.getValue('custrecord_vendor_ach_address');

                            ex.ach_account_number = rec.getValue('custrecord_vendor_ach_account');
                            ex.ach_swift = rec.getValue('custrecord_vendor_ach_swift');
                            ex.ach_aba = rec.getValue('custrecord_vendor_ach_aba');
                            ex.ach_iban = rec.getValue('custrecord_vendor_ach_iban');

                            // WIRE
                            ex.wire_currency = rec.getValue('custrecord_vendor_wire_currency');
                            ex.wire_account_name = rec.getValue('custrecord_vendor_wire_name');
                            ex.wire_bank_name = rec.getValue('custrecord_vendor_wire_bank');
                            ex.wire_account_number = rec.getValue('custrecord_vendor_wire_account');
                            ex.wire_swift = rec.getValue('custrecord_vendor_wire_swift');
                            ex.wire_aba = rec.getValue('custrecord_vendor_wire_aba');
                            ex.wire_iban = rec.getValue('custrecord_vendor_wire_iban');

                            // Authorization
                            ex.auth_name = rec.getValue('custrecord_vendor_auth_name');
                            ex.auth_title = rec.getValue('custrecord_vendor_auth_title');

                            ex.auth_date = toISODate(rec.getValue('custrecord_vendor_auth_date'));
                            ex.auth_signature = rec.getValue('custrecord_vendor_signature');
                            ex.auth_email = rec.getValue('custrecord_vendor_auth_email');
                            ex.auth_tc_email = rec.getValue('custrecord_vendor_auth_tc_email');

                            // Attachments (FULL: id, name, url, size)
                            try {
                                var bankId = rec.getValue('custrecord_bank_file');
                                if (bankId) {
                                    var bf = file.load({ id: bankId });
                                    existingFiles.bank = { id: bankId, name: bf.name, url: bf.url || '', size: bf.size || '' };
                                }
                            } catch (e) { log.debug('Bank file preview load failed', e); }
                            try {
                                var w9Id = rec.getValue('custrecord_w9_file');
                                if (w9Id) {
                                    var wf = file.load({ id: w9Id });
                                    existingFiles.w9 = { id: w9Id, name: wf.name, url: wf.url || '', size: wf.size || '' };
                                }
                            } catch (e) { log.debug('W9 file preview load failed', e); }
                            try {
                                var insId = rec.getValue('custrecord_insurance_file');
                                if (insId) {
                                    var ifl = file.load({ id: insId });
                                    existingFiles.ins = { id: insId, name: ifl.name, url: ifl.url || '', size: ifl.size || '' };
                                }
                            } catch (e) { log.debug('Insurance file preview load failed', e); }
                            try {
                                var wcId = rec.getValue('custrecord_wc_clearance_file'); // <-- UPDATE if your field id differs
                                if (wcId) {
                                    var wcf = file.load({ id: wcId });
                                    existingFiles.wc = { id: wcId, name: wcf.name, url: wcf.url || '', size: wcf.size || '' };
                                }
                            } catch (e) { log.debug('Workers Comp file preview load failed', e); }

                        } catch (e) {
                            log.error('Failed to load existing record for prefill', e);
                        }
                    }

                    // Build Payment Terms <option>s, selecting current if present
                    var optionsHtml = '<option value="">Select</option>';
                    try {
                        var termSearchObj = search.create({
                            type: 'term',
                            filters: [
                                ['isinactive', 'is', 'F'],
                                "AND",
                                ['internalid', 'anyof', "2", "12", "8"]
                            ],
                            columns: ['internalid', 'name']
                        });
                        var selected = '';
                        
                        termSearchObj.run().each(function (r) {
                            var id = r.getValue('internalid');
                            var name = (r.getValue('name') || '')
                                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;');
                            selected = (ex.payment_terms && String(ex.payment_terms) === String(id)) ? ' selected' : '';
                            if (name !== 'TBD')
                                optionsHtml += '<option value="' + id + '"' + selected + '>' + name + '</option>';
                            return true;
                        });
                      selected = ''
                       log.audit('terms', {payment_other: ex.payment_other, payment_terms: ex.payment_terms, selected: selected})
                        if (ex.payment_other && !ex.payment_terms && !selected) selected = ' selected'
                       log.audit('terms 2', {payment_other: ex.payment_other, payment_terms: ex.payment_terms, selected: selected})


                        optionsHtml += "<option value='0'" + selected + ">Other, Term isn't listed</option>";
                    } catch (e) {
                        log.error('Error building Payment Terms options', e);
                    }

                    // Prefill helpers
                    var hasMailing = !!(ex.mail_street || ex.mail_po_box || ex.mail_city || ex.mail_state || ex.mail_zip || ex.mail_country);
                    var mailingDisplay = hasMailing ? 'block' : 'none';
                    var pm = (ex.payment_method || '').toUpperCase();
                    var selEFT = (pm === 'EFT') ? ' selected' : '';
                    var selACH = (pm === 'ACH') ? ' selected' : '';
                    var selWIRE = (pm === 'WIRE') ? ' selected' : '';
                    var selOTHER = (pm === 'OTHER') ? ' selected' : '';

                    var bt = (ex.ach_bank_type || '');
                    log.audit('bt', bt)
                    var selChequing = (bt == 1 || bt.indexOf('Chequing') === 0) ? ' selected' : '';
                    var selSavings = (bt == 2 || bt.indexOf('Savings') === 0) ? ' selected' : '';
                    var selLoan = (bt == 3 || bt.indexOf('Loan') === 0) ? ' selected' : '';
                    var selGeneral = (bt == 4 || bt.indexOf('General') === 0) ? ' selected' : '';

                    var wireUSD = (ex.wire_currency === 'USD') ? ' selected' : '';
                    var wireCAD = (ex.wire_currency === 'CAD') ? ' selected' : '';
                    var wireEUR = (ex.wire_currency === 'EUR') ? ' selected' : '';

                    function existingPreviewHTML(obj, areaKey) {
                        if (!obj) return '';
                        var sizeTxt = obj.size ? ' (' + obj.size + ' bytes)' : '';
                        var link = obj.url ? ('<a href="' + esc(obj.url) + '" target="_blank" rel="noopener">' + esc(obj.name) + '</a>') : esc(obj.name);
                        return '' +
                            '<div class="preview-item" id="existing_' + areaKey + '">' +
                            '<div class="preview-item-icon">📎 ' +
                            '<span class="preview-item-name">Existing file: ' + link + sizeTxt + '</span>' +
                            '</div>' +
                            '<div>' +
                            '<button type="button" class="btn-replace" data-area="' + areaKey + '">Replace</button> ' +
                            '<button type="button" class="preview-item-remove" data-area="' + areaKey + '">Remove</button>' +
                            '</div>' +
                            '</div>';
                    }

                    // === Build Country → States map from NetSuite "state" record ===
                    var stateMap = {}; // { 'Canada': [{n:'Ontario', c:'ON'}, ...], 'United States': [...] }
                    try {
                        var stateSearchObj = search.create({
                            type: 'state',
                            filters: [['inactive', 'is', 'F']],
                            columns: [
                                search.createColumn({ name: 'fullname' }), // e.g. "Ontario"
                                search.createColumn({ name: 'id' }), // e.g. "ON"
                                search.createColumn({ name: 'country' })  // e.g. "Canada"
                            ]
                        });
                        stateSearchObj.run().each(function (res) {
                            var country = res.getText({ name: 'country' }) || res.getValue({ name: 'country' }) || '';
                            var full = res.getValue({ name: 'fullname' }) || '';
                            var short = res.getValue({ name: 'id' }) || '';
                            if (!country || !full) return true;

                            if (!stateMap[country]) stateMap[country] = [];
                            stateMap[country].push({ n: full, c: short });
                            return true;
                        });
                    } catch (e) {
                        log.error('State search failed', e);
                    }

                    // Serialize map safely for embedding in <script>
                    function safeJSONStringify(obj) {
                        var s = JSON.stringify(obj || {});
                        // prevent </script> breakage in HTML
                        return s.replace(/<\//g, '<\\/');
                    }

                    // Capture prefilled selections
                    var prefillStateVendor = ex.state || '';
                    var prefillStateMail = ex.mail_state || '';
                    var prefillStateBank = ex.bank_state || '';


                    var htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Vendor Onboarding Form</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
  .preview-item { margin-top: 8px; background: #fff; padding: 8px; border-radius: 6px; border: 1px solid #ddd; display: flex; align-items: center; justify-content: space-between; }
  .preview-item-icon { font-size: 14px; color: #333; }
  .preview-item-name { font-size: 12px; color: #555; margin-left: 8px; }
  .row { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
  .tile { background-color: #f9f9f9; border-radius: 12px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1); padding: 20px; flex: 1 1 calc(33.333% - 20px); box-sizing: border-box; }
  .tile h2 { margin-top: 0; background-color: #fcac16; color: white; padding: 10px; border-radius: 5px; font-size: 16pt; }
  .preview-item-remove { background: none; border: none; color: #dc3545; cursor: pointer; font-size: 14px; padding: 2px 6px; margin-left: 10px; line-height: 1; border-radius: 3px; }
  .preview-item-remove:hover { background-color: #f8d7da; color: #bd2130; }
  .btn-replace { background: none; border: 1px solid #888; color: #333; cursor: pointer; font-size: 12px; padding: 2px 8px; border-radius: 3px; margin-right: 6px; }
  .btn-replace:hover { background: #eee; }
  input, select, textarea { width: 100%; padding: 8px; margin-top: 4px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
  .inline { display: inline-block; width: 48%; margin-right: 2%; }
  .hidden { display: none; }
  label { display: block; margin-top: 10px; font-weight: bold; color: #333; }
  button { padding: 12px 20px; background-color: #f57c00; color: white; border: none; border-radius: 5px; font-size: 14pt; cursor: pointer; }
  .submit-container { width: 100%; text-align: center; margin-top: 15px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
  .submit-blurp { width: 100%; text-align: center; font-weight: bold; font-size: 15pt; margin-top: 30px; }
  button:hover { background-color: #e65100; }
</style>
<script>
  function toggleMailingAddress(checkbox, sectionId) {
    const section = document.getElementById(sectionId);
    section.style.display = checkbox.checked ? 'block' : 'none';
  }
  function togglePaymentSection(select) {
    document.querySelectorAll('.payment-section').forEach(section => {
      section.style.display = 'none';
      section.querySelectorAll('input, select').forEach(field => field.required = false);
    });
    if (select.value) {
      const selectedSection = document.getElementById(select.value);
      if (selectedSection) {
        selectedSection.style.display = 'block';
        selectedSection.querySelectorAll('input, select').forEach(field => 
        {
        console.log('field', field)
        if (field.name !== 'wire_aba' && field.name !== 'ach_swift') {
        field.required = true}
        });
      }
    }
  }
</script>
</head>
<body style="background-color: #f4f4f4;">
<form method="POST" enctype="multipart/form-data">
  <!-- Action + resume support -->
  <input type="hidden" name="form_action" id="form_action" value="submit">
  <input type="hidden" name="existing_id" id="existing_id" value="${esc(existingIdFromUrl)}">

  <div style="text-align:center; margin-bottom: 20px;">
    <img src="https://6518122.app.netsuite.com/core/media/media.nl?id=6122&c=6518122&h=m6_0Vrb_g_AphBfET8BOfpOVIeIbop4Sotx3jZo2T1ewbnzh" alt="Company Logo" style="max-width: 300px; height: auto;" />
  </div>

  <div class="row">
    <div class="tile">
      <h2>Vendor Details</h2>
      <label>Legal Company Name: *<input name="legal_company_name" value="${esc(ex.legal_company_name)}" required></label>
      <label>DBA Company Name:<input name="dba_name" value="${esc(ex.dba_name)}"></label>
      <label>Type: *</label>
<div style="display:flex; gap:20px; align-items:center; margin-top:4px;">
  <label style="display:flex; align-items:center; gap:4px; margin:0;">
    <input type="radio" name="vendor_type" value="1"
           ${Number(ex.vendor_type) === 1 ? 'checked' : (!ex.vendor_type ? 'checked' : '')}
           required> Company
  </label>
  <label style="display:flex; align-items:center; gap:4px; margin:0;">
    <input type="radio" name="vendor_type" value="2"
           ${Number(ex.vendor_type) === 2 ? 'checked' : ''}
           required> Individual
  </label>
</div>

<!-- 👇 ADD: First / Last name (only for Individual) -->
<div id="individual-fields" style="display:${Number(ex.vendor_type) === 2 ? 'block' : 'none'}; margin-top:8px;">
  <label>First Name: *<input name="first_name" value="${esc(ex.first_name)}"></label>
  <label>Last Name: *<input name="last_name"  value="${esc(ex.last_name)}"></label>
</div>
      <label>Business Number/TIN/GST/HST: <input name="business_number" value="${esc(ex.business_number)}"></label>
      <label>Website:<input name="website" value="${esc(ex.website)}"></label>
      <label>Country: *
      <select name="ven_country" required>${countryOptions(ex.country)}</select>
      </label>
      <label>Street Address: *<input name="street_address" value="${esc(ex.street_address)}" required></label>
      <label>PO Box:<input name="po_box" value="${esc(ex.po_box)}"></label>
      <label>City: *<input name="city" value="${esc(ex.city)}" required></label>
      <label>Province/State: *
  <select id="state" name="state" required></select>
</label>
      <label>Postal Code/ZIP Code: *<input name="zip" value="${esc(ex.zip)}" required></label>
      
      <label style="display: inline-flex; align-items: center; gap: 8px;">Is your mailing address different from your physical address?
        <input id="mailing_toggle" type="checkbox" ${hasMailing ? 'checked' : ''} onchange="toggleMailingAddress(this, 'mailing-address')">
      </label>
      <div id="mailing-address" style="display:${mailingDisplay}">
      <label>Country:
        <select name="ven_mail_country">${countryOptions(ex.mail_country)}</select>
        </label>
        <label>Street Address:<input name="mail_street" value="${esc(ex.mail_street)}"></label>
        <label>PO Box:<input name="mail_po_box" value="${esc(ex.mail_po_box)}"></label>
        <label>City:<input name="mail_city" value="${esc(ex.mail_city)}"></label>
        <label>Province/State:<select id="mail_state" name="mail_state"></select></label>
        <label>Postal Code/ZIP Code:<input name="mail_zip" value="${esc(ex.mail_zip)}"></label>
        
      </div>
    </div>

    <div class="tile">
      <h2>Contact Details</h2>
      <label>Purchasing Contact Name: *<input name="purch_contact_name" value="${esc(ex.purch_contact_name)}" required></label>
      <label>Title:<input name="purch_title" value="${esc(ex.purch_title)}"></label>
      <div class="inline"><label>Telephone Number: *<input type="tel" name="purch_phone" value="${esc(ex.purch_phone)}" required></label></div>
      <div class="inline"><label>Extension:<input name="purch_ext" value="${esc(ex.purch_ext)}"></label></div>
      <div class="inline"><label>Alternate Telephone Number:<input type="tel" name="purch_alt_phone" value="${esc(ex.purch_alt_phone)}"></label></div>
      <div class="inline"><label>Extension:<input name="purch_alt_ext" value="${esc(ex.purch_alt_ext)}"></label></div>
      <label>Email: *<input type="email" name="purch_email" value="${esc(ex.purch_email)}" required></label>
      <hr>
      <label>Accounting Contact Name: *<input name="acc_contact_name" value="${esc(ex.acc_contact_name)}" required></label>
      <label>Title:<input name="acc_title" value="${esc(ex.acc_title)}"></label>
      <div class="inline"><label>Telephone Number: *<input type="tel" name="acc_phone" value="${esc(ex.acc_phone)}" required></label></div>
      <div class="inline"><label>Extension:<input name="acc_ext" value="${esc(ex.acc_ext)}"></label></div>
      <div class="inline"><label>Alternate Telephone Number:<input type="tel" name="acc_alt_phone" value="${esc(ex.acc_alt_phone)}"></label></div>
      <div class="inline"><label>Extension:<input name="acc_alt_ext" value="${esc(ex.acc_alt_ext)}"></label></div>
      <label>Email: *<input type="email" name="acc_email" value="${esc(ex.acc_email)}" required></label>
    </div>

    <div class="tile">
      <h2>Payment & Banking Details</h2>
      <label>Bank Name: *<input name="bank_name" value="${esc(ex.bank_name)}" required></label>
      <label>Country: *
      <select name="bank_country" required>${countryOptions(ex.bank_country)}</select></label>
      <label>Bank Address: *<input name="bank_address" value="${esc(ex.bank_address)}" required></label>
      <label>PO Box:<input name="bank_po_box" value="${esc(ex.bank_po_box)}"></label>
      <label>City: *<input name="bank_city" value="${esc(ex.bank_city)}" required></label>
      <label>Province/State: *<select id="bank_state" name="bank_state" value="${esc(ex.bank_state)}" required></select></label>
      <label>Postal Code/ZIP Code: *<input name="bank_zip" value="${esc(ex.bank_zip)}" required></label>
      
      <label>Branch Telephone:<input name="branch_telephone" value="${esc(ex.branch_telephone)}"></label>
      <label>Bank Contact:<input name="bank_contact" value="${esc(ex.bank_contact)}"></label>
      <label>Bank Contact Email:<input type="email" name="bank_contact_email" value="${esc(ex.bank_contact_email)}"></label>
      <label>Payment Method:</label>
      <p>Please send all invoices to <a href="mailto:ap@trusscore.com">ap@trusscore.com</a></p>
      <label>Payment Terms: *
        <select name="payment_terms" id="payment_terms" required>${optionsHtml}</select>
      </label>
<div id="alt_terms_box" style="display:none; margin-top:10px;">
  <label>
    If the payment term is not available, please outline the alternative extended terms here:
    <input name="payment_other" id="payment_other" rows="3" value="${esc(ex.payment_other || '')}">
  </label>
</div>

      <label>Remittance Email: *<input name="remit_email" type="email" value="${esc(ex.remit_email)}" required></label>
      <label>Choose the appropriate payment method:
        <select name="payment_method" onchange="togglePaymentSection(this)">
          <option value="">Select</option>
          <option value="EFT"${selEFT}>EFT (CAD)</option>
          <option value="ACH"${selACH}>ACH (USD)</option>
          <option value="WIRE"${selWIRE}>WIRE (USD/CAD/EUR)</option>
          <option value="OTHER"${selOTHER}>Other Payment Method</option>
        </select>
      </label>
      <div id="OTHER" class="payment-section hidden">
       <label>Please describe the payment method you intend to use (e.g., online portal, etc.): *
         <input name="other_payment_text" value="${esc(ex.other_payment_text)}">
       </label>
      </div>
      <div id="EFT" class="payment-section hidden">
        <label>Legal Name on Account: *<input name="eft_account_name" value="${esc(ex.eft_account_name)}"></label>
        <label>Account Number: *<input name="eft_account_number" value="${esc(ex.eft_account_number)}"></label>
        <label>Institution Number (3 digits): *<input name="eft_inst_number" value="${esc(ex.eft_inst_number)}"></label>
        <label>Transit Number (5 digits): *<input name="eft_transit_number" value="${esc(ex.eft_transit_number)}"></label>
      </div>
      <div id="ACH" class="payment-section hidden">
        <label>Legal Name on Account: *<input name="ach_account_name" value="${esc(ex.ach_account_name)}"></label>
        <label>Bank Account Type:
        <select name="bank_account_type" >
          <option value="">Select</option>
          <option value="Chequing"${selChequing}>Chequing</option>
          <option value="Savings"${selSavings}>Savings</option>
          <option value="Loan"${selLoan}>Loan</option>
          <option value="General"${selGeneral}>General Ledger</option>
        </select>
      </label>
        <label>Account Number/IBAN: *<input name="ach_account_number" value="${esc(ex.ach_account_number)}"></label>
        <label>Swift/BIC Code:<input name="ach_swift" value="${esc(ex.ach_swift)}"></label>
        <label>ABA/Routing Number: *<input name="ach_aba" value="${esc(ex.ach_aba)}"></label>
      </div>
      <div id="WIRE" class="payment-section hidden">
        <label>Currency: *
          <select name="wire_currency">
            <option${wireUSD}>USD</option>
            <option${wireCAD}>CAD</option>
            <option${wireEUR}>EUR</option>
          </select>
        </label>
        <label>Legal Name on Account: *<input name="wire_account_name" value="${esc(ex.wire_account_name)}"></label>
        <label>Account Number/IBAN: *<input name="wire_account_number" value="${esc(ex.wire_account_number)}"></label>
        <label>Swift/BIC Code: *<input name="wire_swift" value="${esc(ex.wire_swift)}"></label>
        <label>ABA/Routing Number:<input name="wire_aba" value="${esc(ex.wire_aba)}"></label>
      </div>
      <div id="CHEQUE" class="payment-section hidden">
        <label>Currency: *
          <select name="cheque_currency"><option>USD</option><option>CAD</option></select>
        </label>
        <label>Legal Name on Account: *<input name="cheque_account_name"></label>
        <label style="display: inline-flex; align-items: center; gap: 8px;">Is Mailing Address Different from Above?
          <input name="payment_method" type="checkbox" onchange="toggleMailingAddress(this, 'cheque-mail')">
        </label>
        <div id="cheque-mail" class="hidden">
          <label>Street Address:<input name="cheque_mail_street"></label>
          <label>PO Box:<input name="cheque_mail_po_box"></label>
          <label>City:<input name="cheque_mail_city"></label>
          <label>Province/State:<input name="cheque_mail_state"></label>
          <label>Postal Code/ZIP Code:<input name="cheque_mail_zip"></label>
          <label>Country:<input name="cheque_mail_country"></label>
        </div>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="tile">
      <h2>Authorization</h2>
      <p>Please note that in order to combat phishing schemes we will never update your banking information based on an email request. We will always validate updates by phone.</p>
      <p>If you have any questions please contact our AP Team at <strong><a href="mailto:ap@trusscore.com">ap@trusscore.com</a></strong></p>
      <label>Name: *<input name="auth_name" value="${esc(ex.auth_name)}" required></label>
      <label>Title: *<input name="auth_title" value="${esc(ex.auth_title)}" required></label>
      
      <label>Date: *<input name="auth_date" type="date" value="${esc(ex.auth_date)}" required></label>
      <label>Authorized Signature: *
        <input name="auth_signature" type="text" placeholder="Type full name for digital signature" value="${esc(ex.auth_signature)}" required
               style="font-family: 'Brush Script MT', cursive; font-size: 1.2em;">
      </label>
      <label>Confirmation Email: *
      <p>Upon saving draft or submission you will receive and email confirmation to this address</p>
      <input name="auth_email" type="email" value="${esc(ex.auth_email)}" required></label>
      <label>Trusscore Contact Email: *
      <p>Upon submission and vendor approval, your Trusscore contact will get notified</p>
      <input name="auth_tc_email" type="email" value="${esc(ex.auth_tc_email)}" required></label>
    </div>

    <div class="tile">
      <h2>Attachments</h2>

      <!-- BANK -->
      <div class="upload-container">
        <label>Banking Information / Void Cheque</label>
        <div class="file-drop-area" data-target="custpage_file_data_bank" data-preview="preview_bank" data-keep="custpage_keep_bank">
          <span class="fake-btn">Choose file</span>
          <span class="file-msg">or drag and drop file here</span>
          <input class="file-input" type="file" accept="*/*">
        </div>
        <div class="file-preview" id="preview_bank">
          ${existingPreviewHTML(existingFiles.bank, 'bank')}
        </div>
        <textarea id="custpage_file_data_bank" name="custpage_file_data_bank" style="display:none;"></textarea>
        <input type="hidden" id="custpage_keep_bank" name="custpage_keep_bank" value="${existingFiles.bank ? '1' : '0'}">
      </div>

      <!-- W9 -->
      <div class="upload-container">
        <label>W9</label>
        <div class="file-drop-area" data-target="custpage_file_data_w9" data-preview="preview_w9" data-keep="custpage_keep_w9">
          <span class="fake-btn">Choose file</span>
          <span class="file-msg">or drag and drop file here</span>
          <input class="file-input" type="file" accept="*/*">
        </div>
        <div class="file-preview" id="preview_w9">
          ${existingPreviewHTML(existingFiles.w9, 'w9')}
        </div>
        <textarea id="custpage_file_data_w9" name="custpage_file_data_w9" style="display:none;"></textarea>
        <input type="hidden" id="custpage_keep_w9" name="custpage_keep_w9" value="${existingFiles.w9 ? '1' : '0'}">
      </div>

      <!-- INSURANCE -->
      <div class="upload-container">
        <label>Certificate of Insurance</label>
        <div class="file-drop-area" data-target="custpage_file_data_insurance" data-preview="preview_insurance" data-keep="custpage_keep_insurance">
        <span class="fake-btn">Choose file</span>
        <span class="file-msg">or drag and drop file here</span>
        <input class="file-input" type="file" accept="*/*">
        </div>
        <div class="file-preview" id="preview_insurance">
        ${existingPreviewHTML(existingFiles.ins, 'insurance')}
        </div>
        <textarea id="custpage_file_data_insurance" name="custpage_file_data_insurance" style="display:none;"></textarea>
        <input type="hidden" id="custpage_keep_insurance" name="custpage_keep_insurance" value="${existingFiles.ins ? '1' : '0'}">
        </div>
        
        <!-- WORKERS COMP CLEARANCE CERTIFICATE -->
        <div class="upload-container">
        <label>Workers Compensation Clearance Certificate</label>
        <div class="file-drop-area" data-target="custpage_file_data_wc" data-preview="preview_wc" data-keep="custpage_keep_wc">
        <span class="fake-btn">Choose file</span>
        <span class="file-msg">or drag and drop file here</span>
        <input class="file-input" type="file" accept="*/*">
        </div>
        <div class="file-preview" id="preview_wc">
        ${existingPreviewHTML(existingFiles.wc, 'wc')}
        </div>
        <textarea id="custpage_file_data_wc" name="custpage_file_data_wc" style="display:none;"></textarea>
        <input type="hidden" id="custpage_keep_wc" name="custpage_keep_wc" value="${existingFiles.wc ? '1' : '0'}">
        </div>

    </div>

    <p style="color: red; font-style: italic; text-align: center;" class="submit-blurp">
      You will receive an email confirmation upon submission.
    </p>

    <div class="submit-container">
      <button type="button" id="btnSaveDraft" title="Save your progress to finish later">Save Draft</button>
      <button type="submit" id="btnSubmitFinal">Submit</button>
    </div>
  </div>
</form>

<script>
  class SingleFileUpload {
    constructor(dropArea, previewArea, targetFieldId, keepFlagId) {
      this.dropArea = dropArea;
      this.fileInput = dropArea.querySelector('.file-input');
      this.previewArea = previewArea;
      this.targetField = document.getElementById(targetFieldId);
      this.keepFlag = document.getElementById(keepFlagId);
      this.init();
    }
    init() {
      ['dragenter','dragover','dragleave','drop'].forEach(ev => {
        this.dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false);
      });
      ['dragenter','dragover'].forEach(ev => {
        this.dropArea.addEventListener(ev, () => this.dropArea.classList.add('is-active'));
      });
      ['dragleave','drop'].forEach(ev => {
        this.dropArea.addEventListener(ev, () => this.dropArea.classList.remove('is-active'));
      });
      this.dropArea.addEventListener('drop', e => this.handleFile(e.dataTransfer.files[0]));
      this.fileInput.addEventListener('change', e => this.handleFile(e.target.files[0]));
    }
    handleFile(file) {
      if (!file) return;
      this.previewArea.innerHTML = '';
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        this.targetField.value = JSON.stringify({ name: file.name, type: file.type, base64: base64 });
        // New file replaces existing → mark keep=0
        if (this.keepFlag) this.keepFlag.value = '0';

        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.innerHTML = \`
          <div class="preview-item-icon">📄 
            <span class="preview-item-name">\${file.name} (\${(file.size/1024).toFixed(1)} KB)
              <button class="preview-item-remove">✕</button>
            </span>
          </div>\`;
        previewItem.querySelector('.preview-item-remove').addEventListener('click', () => {
          this.previewArea.innerHTML = '';
          this.targetField.value = '';
          this.fileInput.value = '';
        });
        this.previewArea.appendChild(previewItem);
      };
      reader.readAsDataURL(file);
    }
  }

  var STATE_DATA = JSON.parse('${safeJSONStringify(stateMap)}');

var PREFILL_STATE_VENDOR = ${JSON.stringify(prefillStateVendor ? String(prefillStateVendor) : '')};
var PREFILL_STATE_MAIL   = ${JSON.stringify(prefillStateMail ? String(prefillStateMail) : '')};
var PREFILL_STATE_BANK   = ${JSON.stringify(prefillStateBank ? String(prefillStateBank) : '')};

function populateStates(countryText, selectId, selectedValue) {
  var sel = document.getElementById(selectId);
  if (!sel) return;

  var list = STATE_DATA[countryText] || [];

  if (!list.length) {
    if (sel.tagName.toLowerCase() === 'select') {
      var input = document.createElement('input');
      input.type = 'text';
      input.id = sel.id;
      input.name = sel.name;
      input.value = selectedValue || '';
      input.required = sel.required;
      sel.parentNode.replaceChild(input, sel);
    } else {
      sel.value = selectedValue || '';
    }
    return;
  }

  if (sel.tagName.toLowerCase() !== 'select') {
    var newSel = document.createElement('select');
    newSel.id = sel.id;
    newSel.name = sel.name;
    newSel.required = sel.required;
    sel.parentNode.replaceChild(newSel, sel);
    sel = newSel;
  }

  sel.innerHTML = '';
  var opt0 = document.createElement('option');
  opt0.value = '';
  opt0.text = 'Select';
  sel.appendChild(opt0);

  for (var i = 0; i < list.length; i++) {
    var st = list[i];
    var opt = document.createElement('option');
    opt.value = st.c || st.n;  // store short code if present, else full name
    opt.text  = st.n;
    if (selectedValue && (selectedValue === st.c || selectedValue === st.n)) opt.selected = true;
    sel.appendChild(opt);
  }
}

function hookCountryState(countryNameAttr, stateSelectId, prefillState) {
  var countrySel = document.querySelector('[name="' + countryNameAttr + '"]');
  if (!countrySel) return;

  function sync() {
    var cText = (countrySel.options && countrySel.selectedIndex >= 0)
      ? countrySel.options[countrySel.selectedIndex].text
      : (countrySel.value || '');
    populateStates(cText, stateSelectId, prefillState);
  }

  countrySel.addEventListener('change', function() {
    populateStates(countrySel.options[countrySel.selectedIndex].text, stateSelectId, '');
  });

  sync();
}

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('form');
    const actionField = document.getElementById('form_action');
const termsSelect = document.getElementById('payment_terms');
const altBox = document.getElementById('alt_terms_box');
const altInput = document.getElementById('payment_other');

//ADD: toggle logic for Individual fields
function toggleIndividualUI(){
  var radios = document.querySelectorAll('input[name="vendor_type"]');
  var isInd = false;
  radios.forEach(function(r){ if (r.checked && r.value === '2') isInd = true; });

  var box = document.getElementById('individual-fields');
  if (box) box.style.display = isInd ? 'block' : 'none';

  var fn = document.querySelector('input[name="first_name"]');
  var ln = document.querySelector('input[name="last_name"]');
  if (fn && ln){
    if (isInd) { fn.setAttribute('required','required'); ln.setAttribute('required','required'); }
    else       { fn.removeAttribute('required');         ln.removeAttribute('required'); }
  }
}


function syncAltTerms() {
  const isOther = termsSelect && termsSelect.value === '0';
  if (!altBox) return;
  altBox.style.display = isOther ? 'block' : 'none';
  if (altInput) {
    if (isOther) altInput.setAttribute('required', 'required');
    else altInput.removeAttribute('required');
  }
}

if (termsSelect) {
  termsSelect.addEventListener('change', syncAltTerms);
  // ensure correct state on load (prefill / resume)
  syncAltTerms();
}


    // Final submit confirm
    form.addEventListener('submit', function (e) {
      if (actionField.value === 'draft') return; // skip confirm for drafts
      const doubleCheck = confirm("Are you sure you want to submit now? You will not be able to edit after this.");
      if (!doubleCheck) { e.preventDefault(); return false; }
    });

    hookCountryState('ven_country',      'state',      PREFILL_STATE_VENDOR);
hookCountryState('ven_mail_country', 'mail_state', PREFILL_STATE_MAIL);
hookCountryState('bank_country',     'bank_state', PREFILL_STATE_BANK);

    // SAVE DRAFT: require Legal Name + full Authorization; bypass other required warnings
    document.getElementById('btnSaveDraft').addEventListener('click', function () {
      actionField.value = 'draft';
      const mustHaveForDraft = [
        ['legal_company_name','Legal Company Name'],
        ['auth_name','Authorization Name'],
        ['auth_title','Authorization Title'],
        ['auth_date','Authorization Date'],
        ['auth_signature','Digital Signature'],
        ['auth_email','Confirmation Email'],
        ['auth_tc_email','Trusscore Contact Email'],
      ];
      const missing = [];
      mustHaveForDraft.forEach(([name,label]) => {
        const el = form.querySelector(\`[name="\${name}"]\`);
        if (!el || !String(el.value).trim()) missing.push(label);
      });
      if (missing.length) {
        alert('Please complete the following before saving a draft:\\n• ' + missing.join('\\n• '));
        return;
      }
      // Strip native required so browser doesn't block
      form.querySelectorAll('[required]').forEach(el => el.removeAttribute('required'));
      // Post as draft
      form.submit();
    });

    // Init file widgets
    document.querySelectorAll('.file-drop-area').forEach(drop => {
      const id = drop.dataset.target;
      const previewId = drop.dataset.preview;
      const keepId = drop.dataset.keep;
      const preview = document.getElementById(previewId);
      new SingleFileUpload(drop, preview, id, keepId);
    });

    document.querySelectorAll('input[name="vendor_type"]').forEach(function(r){
  r.addEventListener('change', toggleIndividualUI);
});
toggleIndividualUI();

    // Existing-file controls: Replace & Remove
    function hookExisting(areaKey) {
      const preview = document.getElementById('preview_' + areaKey);
      const drop = document.querySelector('.file-drop-area[data-preview="preview_' + areaKey + '"]');
      if (!preview || !drop) return;
      const input = drop.querySelector('.file-input');
      const keep = document.getElementById('custpage_keep_' + areaKey);

      // Replace: trigger underlying file-input
      const btnReplace = preview.querySelector('.btn-replace');
      if (btnReplace) {
        btnReplace.addEventListener('click', function() { input && input.click(); });
      }
      // Remove: clear preview + mark keep=0 (and ensure no new payload)
      const btnRemove = preview.querySelector('.preview-item-remove');
      if (btnRemove) {
        btnRemove.addEventListener('click', function() {
          preview.innerHTML = '';
          if (keep) keep.value = '0';
          const targetField = document.getElementById(drop.dataset.target);
          if (targetField) targetField.value = '';
          if (input) input.value = '';
        });
      }
    }
    ['bank','w9','wc','insurance'].forEach(hookExisting);

    // Show correct payment section if we have a prefilled value
    const pmSelect = document.querySelector('select[name="payment_method"]');
    if (pmSelect && pmSelect.value) { togglePaymentSection(pmSelect); }

    // Ensure mailing section visibility matches checkbox on load
    const mailingToggle = document.getElementById('mailing_toggle');
    if (mailingToggle) { toggleMailingAddress(mailingToggle, 'mailing-address'); }
  });
</script>
</body>
</html>
        `;

                    htmlField.defaultValue = htmlContent;
                    context.response.writePage(form);
                } catch (e) {
                    log.error('Error loading Suitelet', e.toString());
                    // context.response.write('An error occurred: ' + e.message);
                    showSuiteletError(context, e.message);
                }

            } else if (context.request.method === 'POST') {
                try {
                    var req = context.request;
                    log.debug('req', req)
                    var action = (req.parameters.form_action || 'submit').toLowerCase();
                    var isDraft = (action === 'draft');
                    var tokenFromPost = (req.parameters.t || '').trim();
                    var existingId = tokenFromPost ? decodeToken(tokenFromPost) : null;

                    if (tokenFromPost && !existingId) {
                        context.response.write('<html><body style="font-family:Arial;padding:40px">'
                            + '<h2>Draft link not valid</h2>'
                            + '<p>We could not find any related form details. If you need help, please contact <b>ap@trusscore.com</b>.</p>'
                            + '</body></html>');
                        return;
                    }

                    // Server-side enforcement for Save Draft (Legal Name + full Authorization)
                    if (isDraft) {
                        var mustHaveForDraft = [
                            ['legal_company_name', 'Legal Company Name'],
                            ['auth_name', 'Authorization Name'],
                            ['auth_title', 'Authorization Title'],
                            ['auth_date', 'Authorization Date'],
                            ['auth_signature', 'Digital Signature'],
                            ['auth_email', 'Confirmation Email'],
                            ['auth_tc_email', 'Trusscore Contact Email'],
                        ];
                        var missing = mustHaveForDraft
                            .filter(function (pair) {
                                var v = req.parameters[pair[0]];
                                return !v || !String(v).trim();
                            })
                            .map(function (pair) { return pair[1]; });
                        if (missing.length) {
                            var html = '<html><head><style>body{font-family:Arial;padding:28px;background:#fff;} .card{max-width:640px;margin:0 auto;border:1px solid #eee;border-radius:10px;padding:20px;} .err{color:#b00020} button{margin-top:18px;padding:10px 16px;border:0;background:#444;color:#fff;border-radius:6px;cursor:pointer}</style></head><body><div class="card"><h2 class="err">Draft not saved</h2><p>The following fields are required to save a draft:</p><ul>' +
                                missing.map(function (m) { return '<li>' + m + '</li>'; }).join('') +
                                '</ul><p>Please click Back and complete them.</p><button onclick="history.back()">Back to form</button></div></body></html>';
                            context.response.write(html);
                            return;
                        }
                    }

                    // Create or load custom record
                    var existingId = (context.request.parameters.custpage_record_id || '').trim();
                    log.debug('existingId', existingId)
                    var rec;
                    if (existingId) {
                        rec = record.load({ type: 'customrecord_vendor_onboarding', id: existingId, isDynamic: true });
                    } else {
                        rec = record.create({ type: 'customrecord_vendor_onboarding', isDynamic: true });
                    }

                    // Vendor Details
                    rec.setValue({ fieldId: 'name', value: req.parameters.dba_name || req.parameters.legal_company_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_legal_name', value: req.parameters.legal_company_name });
                    rec.setValue({ fieldId: DRAFT_FIELD, value: isDraft });
                    rec.setValue({ fieldId: 'custrecord_vendor_dba', value: req.parameters.dba_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_type', value: req.parameters.vendor_type || '1' }); // default Company
                    rec.setValue({ fieldId: 'custrecord_first_name', value: req.parameters.first_name || '' });
                    rec.setValue({ fieldId: 'custrecord_last_name', value: req.parameters.last_name || '' });
                    rec.setValue({ fieldId: 'custrecord_vendor_tin', value: req.parameters.business_number });
                    rec.setValue({ fieldId: 'custrecord_vendor_website', value: req.parameters.website });
                    rec.setValue({ fieldId: 'custrecord_vendor_street', value: req.parameters.street_address });
                    rec.setValue({ fieldId: 'custrecord_vendor_po_box', value: req.parameters.po_box });
                    rec.setValue({ fieldId: 'custrecord_vendor_city', value: req.parameters.city });
                    rec.setValue({ fieldId: 'custrecord_vendor_state', value: req.parameters.state });
                    rec.setValue({ fieldId: 'custrecord_vendor_zip', value: req.parameters.zip });
                    rec.setValue({ fieldId: 'custrecord_vendor_country', value: countryId(req.parameters.ven_country) });

                    // Mailing Address
                    rec.setValue({ fieldId: 'custrecord_vendor_mail_street', value: req.parameters.mail_street });
                    rec.setValue({ fieldId: 'custrecord_vendor_mail_po_box', value: req.parameters.mail_po_box });
                    rec.setValue({ fieldId: 'custrecord_vendor_mail_city', value: req.parameters.mail_city });
                    rec.setValue({ fieldId: 'custrecord_vendor_mail_state', value: req.parameters.mail_state });
                    rec.setValue({ fieldId: 'custrecord_vendor_mail_zip', value: req.parameters.mail_zip });
                    rec.setValue({ fieldId: 'custrecord_vendor_mail_country', value: countryId(req.parameters.ven_mail_country) });

                    // Purchasing Contact
                    rec.setValue({ fieldId: 'custrecord_vendor_purch_name', value: req.parameters.purch_contact_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_purch_title', value: req.parameters.purch_title });
                    rec.setValue({ fieldId: 'custrecord_vendor_purch_phone', value: req.parameters.purch_phone });
                    rec.setValue({ fieldId: 'custrecord_vendor_purch_ext', value: req.parameters.purch_ext });
                    rec.setValue({ fieldId: 'custrecord_vendor_purch_alt_phone', value: req.parameters.purch_alt_phone });
                    rec.setValue({ fieldId: 'custrecord_vendor_purch_alt_ext', value: req.parameters.purch_alt_ext });
                    rec.setValue({ fieldId: 'custrecord_vendor_purch_email', value: req.parameters.purch_email });

                    // Accounting Contact
                    rec.setValue({ fieldId: 'custrecord_vendor_acc_name', value: req.parameters.acc_contact_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_acc_title', value: req.parameters.acc_title });
                    rec.setValue({ fieldId: 'custrecord_vendor_acc_phone', value: req.parameters.acc_phone });
                    rec.setValue({ fieldId: 'custrecord_vendor_acc_ext', value: req.parameters.acc_ext });
                    rec.setValue({ fieldId: 'custrecord_vendor_acc_alt_phone', value: req.parameters.acc_alt_phone });
                    rec.setValue({ fieldId: 'custrecord_vendor_acc_alt_ext', value: req.parameters.acc_alt_ext });
                    rec.setValue({ fieldId: 'custrecord_vendor_acc_email', value: req.parameters.acc_email });

                    // Banking Details
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_name', value: req.parameters.bank_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_address', value: req.parameters.bank_address });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_po_box', value: req.parameters.bank_po_box });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_city', value: req.parameters.bank_city });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_state', value: req.parameters.bank_state });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_zip', value: req.parameters.bank_zip });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_country', value: countryId(req.parameters.bank_country) });
                    rec.setValue({ fieldId: 'custrecord_vendor_branch_phone', value: req.parameters.branch_telephone });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_contact', value: req.parameters.bank_contact });
                    rec.setValue({ fieldId: 'custrecord_vendor_bank_contact_email', value: req.parameters.bank_contact_email });
                    if (req.parameters.payment_terms != 0){
                      rec.setValue({ fieldId: 'custrecord_vendor_other_terms', value: '' });
                      rec.setValue({ fieldId: 'custrecord_vendor_payment_terms', value: req.parameters.payment_terms });
                    } 
                    else{
                      rec.setValue({ fieldId: 'custrecord_vendor_other_terms', value: req.parameters.payment_other });
                      rec.setValue({ fieldId: 'custrecord_vendor_payment_terms', value: '' });
                    }
                        

                    rec.setValue({ fieldId: 'custrecord_vendor_remit_email', value: req.parameters.remit_email });
                    rec.setText({ fieldId: 'custrecord_vendor_payment_method', text: req.parameters.payment_method });

                    rec.setValue({ fieldId: 'custrecord_vendor_other', value: req.parameters.other_payment_text || '' });

                    // Payment Method Details
                    rec.setValue({ fieldId: 'custrecord_vendor_eft_name', value: req.parameters.eft_account_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_eft_account', value: req.parameters.eft_account_number });
                    rec.setValue({ fieldId: 'custrecord_vendor_eft_inst', value: req.parameters.eft_inst_number });
                    rec.setValue({ fieldId: 'custrecord_vendor_eft_transit', value: req.parameters.eft_transit_number });

                    rec.setValue({ fieldId: 'custrecord_vendor_ach_name', value: req.parameters.ach_account_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_ach_bank', value: req.parameters.ach_bank_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_ach_address', value: req.parameters.ach_bank_address });
                    rec.setValue({ fieldId: 'custrecord_vendor_ach_account', value: req.parameters.ach_account_number });
                    rec.setValue({ fieldId: 'custrecord_vendor_ach_swift', value: req.parameters.ach_swift });
                    rec.setValue({ fieldId: 'custrecord_vendor_ach_aba', value: req.parameters.ach_aba });
                    rec.setValue({ fieldId: 'custrecord_vendor_ach_iban', value: req.parameters.ach_iban });
                    rec.setText({ fieldId: 'custrecord_ach_bank_type', text: req.parameters.bank_account_type });

                    rec.setValue({ fieldId: 'custrecord_vendor_wire_currency', value: req.parameters.wire_currency });
                    rec.setValue({ fieldId: 'custrecord_vendor_wire_name', value: req.parameters.wire_account_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_wire_bank', value: req.parameters.wire_bank_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_wire_account', value: req.parameters.wire_account_number });
                    rec.setValue({ fieldId: 'custrecord_vendor_wire_swift', value: req.parameters.wire_swift });
                    rec.setValue({ fieldId: 'custrecord_vendor_wire_aba', value: req.parameters.wire_aba });
                    rec.setValue({ fieldId: 'custrecord_vendor_wire_iban', value: req.parameters.wire_iban });

                    // Authorization
                    rec.setValue({ fieldId: 'custrecord_vendor_auth_name', value: req.parameters.auth_name });
                    rec.setValue({ fieldId: 'custrecord_vendor_auth_title', value: req.parameters.auth_title });
                    rec.setValue({ fieldId: 'custrecord_vendor_auth_email', value: req.parameters.auth_email });
                    rec.setValue({ fieldId: 'custrecord_vendor_auth_tc_email', value: req.parameters.auth_tc_email });
                    rec.setValue({ fieldId: 'custrecord_vendor_auth_date', value: req.parameters.auth_date ? new Date(req.parameters.auth_date) : '' });
                    rec.setValue({ fieldId: 'custrecord_vendor_signature', value: req.parameters.auth_signature });

                    // Upload files (from base64 payloads) + clear/remove logic
                    const folderId = 291180;
                    function guessFileType(name) {
                        const lower = (name || '').toLowerCase();
                        if (lower.endsWith('.pdf')) return file.Type.PDF;
                        if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return file.Type.EXCEL;
                        if (lower.endsWith('.csv')) return file.Type.PLAINTEXT;
                        if (lower.endsWith('.png')) return file.Type.PNGIMAGE;
                        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return file.Type.JPGIMAGE;
                        if (lower.endsWith('.gif')) return file.Type.GIFIMAGE;
                        return file.Type.PLAINTEXT;
                    }
                    const savedFileIds = [];
                    [
                        { param: 'custpage_file_data_bank', keep: 'custpage_keep_bank', fieldId: 'custrecord_bank_file', name: 'Bank File - ' },
                        { param: 'custpage_file_data_w9', keep: 'custpage_keep_w9', fieldId: 'custrecord_w9_file', name: 'W9 File - ' },
                        { param: 'custpage_file_data_insurance', keep: 'custpage_keep_insurance', fieldId: 'custrecord_insurance_file', name: 'Insurance File - ' },
                        { param: 'custpage_file_data_wc', keep: 'custpage_keep_wc', fieldId: 'custrecord_wc_clearance_file', name: 'Workers Comp - ' } // <-- UPDATE fieldId if needed
                    ].forEach(function (f) {
                        var jsonString = req.parameters[f.param];
                        var keepFlag = req.parameters[f.keep]; // '1' keep old if no new; '0' clear if no new
                        if (jsonString) {
                            try {
                                var fileData = JSON.parse(jsonString);
                                var fobj = file.create({
                                    name: f.name + fileData.name,
                                    fileType: guessFileType(fileData.name),
                                    contents: fileData.base64,
                                    encoding: file.Encoding.BASE_64,
                                    folder: folderId,
                                    isOnline: true
                                });
                                var fid = fobj.save();
                                savedFileIds.push(fid);
                                rec.setValue({ fieldId: f.fieldId, value: fid });
                            } catch (e) {
                                log.error('File save failed for ' + f.param, e);
                            }
                        } else {
                            if (keepFlag === '0') {
                                rec.setValue({ fieldId: f.fieldId, value: '' }); // clear association
                            }
                        }
                    });

                    // Save record (ignore mandatory when draft only)
                    var recId = rec.save({ enableSourcing: true, ignoreMandatoryFields: isDraft });
                    log.audit(isDraft ? 'Draft saved' : 'Submission saved', recId);


                    // Generate and store PDF ONLY for final submissions
                    if (!isDraft) {
                        createAndAttachPdf(recId, req);
                    }

                    // ===== EMAILS =====
                    const authorId = 62388;
                    const recipient = (req.parameters.auth_email || '').trim();

                    // Helper to build pretty HTML email blocks
                    function emailRow(k, v) { return '<tr><td class="k">' + esc(k) + '</td><td class="v">' + esc(v || '—') + '</td></tr>'; }

                    const vendorTypeLabel = (String(req.parameters.vendor_type) === '2') ? 'Individual' : 'Company';
                    const individualNameRows =
                        (String(req.parameters.vendor_type) === '2')
                            ? emailRow('First Name', req.parameters.first_name) +
                            emailRow('Last Name', req.parameters.last_name)
                            : '';

                    if (isDraft) {

                        var tokenForLinks = encodeId(recId);
                        var resumeUrl = 'https://6518122.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=5804&deploy=1&compid=6518122&ns-at=AAEJ7tMQi6u9BSsGXBpBYNAigeywBkbWHEZcIMttBNGYZM87sqY&t=' + tokenForLinks;
                        record.submitFields({
                            type: 'customrecord_vendor_onboarding',
                            id: recId,
                            values: {
                                custrecord_draft_: true,
                                custrecord_draft_id: tokenForLinks
                            }
                        })
                        // -------- Send draft confirmation to the authorized email --------
                        try {
                            if (recipient) {
                                var draftUrl = tokenForLinks;
                                var subjectDraft = 'Trusscore Inc | Vendor Onboarding Draft Saved: ' + (req.parameters.legal_company_name || req.parameters.dba_name || 'Untitled') + ' (Draft #' + tokenForLinks + ')';
                                var bodyDraft =
                                    '<html><head><meta charset="UTF-8"><style>' +
                                    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;background:#f6f8fb;color:#222}' +
                                    '.card{max-width:800px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.08);overflow:hidden}' +
                                    '.header{display:flex;align-items:center;justify-content:space-between;background:#fcac16;color:#fff;padding:18px 22px}' +
                                    '.header h1{margin:0;font-size:18px}' +
                                    '.logo{height:36px;max-width:180px}' +
                                    '.badge{display:inline-block;background:#fff3d1;color:#6b3700;font-weight:700;border-radius:999px;padding:4px 10px;margin-left:8px}' +
                                    '.section{padding:18px 24px;border-top:1px solid #eef2f7}' +
                                    '.tbl{width:100%;border-collapse:collapse}.tbl tr{border-bottom:1px solid #f1f5f9}.tbl td{padding:8px 6px;vertical-align:top}.k{width:240px;color:#667085;font-weight:bold}' +
                                    '.cta-wrap{padding:22px 24px;text-align:center;background:#fafbff;border-top:1px solid #eef2f7}' +
                                    '.btn{display:inline-block;padding:12px 18px;background:#0b5cab;color:#fff;text-decoration:none;border-radius:10px;font-weight:700}' +
                                    '.foot{font-size:12px;color:#6b7280;padding:16px 24px;background:#fbfbfb}' +
                                    '</style></head><body>' +
                                    '<div class="card">' +
                                    '<div class="header" style="background:#fcac16;color:#ffffff;padding:18px 22px;">' +
                                    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">' +
                                    '<tr>' +
                                    '<td valign="middle" style="padding:0;text-align:left;">' +
                                    '<h1 style="margin:0;font-size:18px;line-height:1.3;">' +
                                    'Draft Saved <span class="badge" style="display:inline-block;background:#fff3d1;color:#6b3700;font-weight:700;border-radius:999px;padding:4px 10px;margin-left:8px;">#' + tokenForLinks + '</span>' +
                                    '</h1>' +
                                    '</td>' +
                                    '<td valign="middle" align="right" style="padding:0;text-align:right;">' +
                                    '<img src="' + esc(COMPANY_LOGO_URL) + '" alt="Logo" width="180" style="display:block;height:auto;max-width:180px;border:0;outline:none;text-decoration:none;">' +
                                    '</td>' +
                                    '</tr>' +
                                    '</table>' +
                                    '</div>' +

                                    '<div class="section"><p>Hi ' + esc(req.parameters.auth_name || '') + ',</p>' +
                                    '<p>Your vendor onboarding form for <strong>' + esc(req.parameters.dba_name || req.parameters.legal_company_name || '') + '</strong> has been saved as a draft. You can resume editing any time using the button below.</p></div>' +
                                    '<div class="section"><h3 style="margin:0 0 10px 0;color:#111827;">Quick Summary</h3>' +
                                    '<table class="tbl">' +
                                    emailRow('Legal Company Name', req.parameters.dba_name || req.parameters.legal_company_name) +
                                    emailRow('Type', vendorTypeLabel) +
                                    individualNameRows +
                                    emailRow('Purchasing Contact Email', req.parameters.purch_email) +
                                    emailRow('Accounting Contact Email', req.parameters.acc_email) +
                                    emailRow('Remittance Email', req.parameters.remit_email) +
                                    emailRow('Payment Method', (req.parameters.payment_method || '—') +
                                        (String(req.parameters.payment_method).toUpperCase() === 'OTHER'
                                            && req.parameters.other_payment_text
                                            ? ' – ' + req.parameters.other_payment_text : '')) +
                                    emailRow('Draft ID', '#' + tokenForLinks) +
                                    '</table>' +
                                    '</div>' +
                                    '<div class="cta-wrap"><a class="btn" href="https://6518122.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=5804&deploy=1&compid=6518122&ns-at=AAEJ7tMQi6u9BSsGXBpBYNAigeywBkbWHEZcIMttBNGYZM87sqY&t=' + tokenForLinks + '" target="_blank">Resume Draft</a></div>' +
                                    '<div class="foot">If you did not request this, please ignore this message. We will never update banking information solely via email; any changes are validated by phone.</div>' +
                                    '</div>' +
                                    '</body></html>';


                                email.send({
                                    author: authorId,
                                    recipients: [recipient], // recipient
                                    subject: subjectDraft,
                                    body: bodyDraft
                                });
                                log.audit('Draft email sent', { to: recipient, recId: recId });
                            } else {
                                log.error('Draft email skipped', 'No authorized email (auth_email) provided.');
                            }
                        } catch (e) {
                            log.error('Error sending draft confirmation email', e);
                        }
                    } else {
                        // -------- Final submission confirmation (updated to include missing fields) --------
                        record.submitFields({
                            type: 'customrecord_vendor_onboarding',
                            id: recId,
                            values: { custrecord_draft_: false }
                        });

                        try {
                            function row(k, v) { return '<tr><td class="k">' + esc(k) + '</td><td class="v">' + esc(v || '—') + '</td></tr>'; }

                            // Look up the Payment Terms "name" so we can show a label instead of a raw ID
                            var paymentTermName = '';
                            try {
                                var ptId = (req.parameters.payment_terms || '').toString().trim();
                                if (ptId && ptId !== '0') {
                                    var pt = search.lookupFields({
                                        type: search.Type.TERM,
                                        id: ptId,
                                        columns: ['name']
                                    });
                                    paymentTermName = (pt && pt.name) || '';
                                }
                            } catch (e) { log.debug('lookup term name (email) failed', e); }

                            const pmethod = (req.parameters.payment_method || '').toUpperCase();
                            var paymentDetailsHTML = '';

                            if (pmethod === 'EFT') {
                                paymentDetailsHTML = [
                                    row('Payment Method', 'EFT (CAD)'),
                                    row('Legal Name on Account', req.parameters.eft_account_name),
                                    row('Account Number', req.parameters.eft_account_number),
                                    row('Institution #', req.parameters.eft_inst_number),
                                    row('Transit #', req.parameters.eft_transit_number)
                                ].join('');

                            } else if (pmethod === 'ACH') {
                                paymentDetailsHTML = [
                                    row('Payment Method', 'ACH (USD)'),
                                    row('Legal Name on Account', req.parameters.ach_account_name),
                                    row('Bank Account Type', req.parameters.bank_account_type),
                                    // NEW: show ACH bank name/address captured on the form
                                    row('ACH Bank Name', req.parameters.ach_bank_name),
                                    row('ACH Bank Address', req.parameters.ach_bank_address),
                                    row('Account Number / IBAN', req.parameters.ach_account_number),
                                    row('Swift / BIC', req.parameters.ach_swift),
                                    row('ABA / Routing', req.parameters.ach_aba)
                                ].join('');

                            } else if (pmethod === 'WIRE') {
                                paymentDetailsHTML = [
                                    row('Payment Method', 'WIRE'),
                                    row('Currency', req.parameters.wire_currency),
                                    row('Legal Name on Account', req.parameters.wire_account_name),
                                    // NEW: show Wire Bank Name captured on the form
                                    row('Wire Bank Name', req.parameters.wire_bank_name),
                                    row('Account Number / IBAN', req.parameters.wire_account_number),
                                    row('Swift / BIC', req.parameters.wire_swift),
                                    row('ABA / Routing', req.parameters.wire_aba)
                                ].join('');

                            } else if (pmethod === 'OTHER') {
                                paymentDetailsHTML = [
                                    row('Payment Method', 'Other'),
                                    row('Details', req.parameters.other_payment_text)
                                ].join('');
                            } else {
                                paymentDetailsHTML = row('Payment Method', pmethod || '—');
                            }

                            const vendorTypeLabel = (String(req.parameters.vendor_type) === '2') ? 'Individual' : 'Company';
                            const hasMailing = req.parameters.mail_street || req.parameters.mail_po_box || req.parameters.mail_city || req.parameters.mail_state || req.parameters.mail_zip || req.parameters.ven_mail_country;
                            const mailingHTML = hasMailing ? (
                                '<h3>Mailing Address</h3><table class="tbl">' +
                                row('Street', req.parameters.mail_street) +
                                row('PO Box', req.parameters.mail_po_box) +
                                row('City', req.parameters.mail_city) +
                                row('State/Province', req.parameters.mail_state) +
                                row('Postal/ZIP', req.parameters.mail_zip) +
                                row('Country', req.parameters.ven_mail_country) +
                                '</table>'
                            ) : '';

                            const subject = 'Trusscore Inc | Vendor Onboarding Submitted: ' + (req.parameters.legal_company_name || req.parameters.dba_name || '') + ' (Ref #' + recId + ')';
                            const body = `
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color:#222; margin:0; padding:24px; background:#f7f7f7; }
        .card { max-width:900px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.08); overflow:hidden; }
        .header { display:flex; align-items:center; justify-content:space-between; background:#fcac16; color:#fff; padding:20px 24px; }
        .header h1 { margin:0; font-size:20px; }
        .logo { height:38px; max-width:200px }
        .section { padding:20px 24px; border-top:1px solid #eee; }
        .section h3 { margin:0 0 12px 0; font-size:16px; color:#444; }
        .tbl { width:100%; border-collapse:collapse; }
        .tbl tr { border-bottom:1px solid #f0f0f0; }
        .tbl td { padding:8px 6px; vertical-align:top; }
        .tbl .k { width:260px; color:#666; font-weight:bold; }
        .footer { padding:18px 24px; background:#fafafa; color:#666; font-size:12px; }
        .pill { display:inline-block; padding:4px 10px; border-radius:999px; background:#fff3d6; color:#6b3700; font-weight:bold; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header" style="background:#fcac16;color:#ffffff;padding:20px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
    <tr>
      <td valign="middle" style="padding:0;text-align:left;">
        <h1 style="margin:0;font-size:20px;line-height:1.3;">
          Vendor Onboarding – Confirmation
          <span class="pill" style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fff3d6;color:#6b3700;font-weight:700;margin-left:8px;">#${recId}</span>
        </h1>
      </td>
      <td valign="middle" align="right" style="padding:0;text-align:right;">
        <img src="${COMPANY_LOGO_URL}" alt="Logo" width="180" style="display:block;height:auto;max-width:180px;border:0;outline:none;text-decoration:none;">
      </td>
    </tr>
  </table>
</div>
        <div class="section">
          <h3>Vendor Details</h3>
          <table class="tbl">
            ${row('Legal Company Name', req.parameters.legal_company_name)}
            ${row('DBA Name', req.parameters.dba_name)}
            ${row('Type', vendorTypeLabel)}
            ${(String(req.parameters.vendor_type) === '2'
                                    ? row('First Name', req.parameters.first_name) + row('Last Name', req.parameters.last_name)
                                    : '')}
            ${row('Business Number / TIN', req.parameters.business_number)}
            ${row('Website', req.parameters.website)}
            ${row('Street', req.parameters.street_address)}
            ${row('PO Box', req.parameters.po_box)}
            ${row('City', req.parameters.city)}
            ${row('State/Province', grabStateName(req.parameters.state))}
            ${row('Postal/ZIP', req.parameters.zip)}
            ${row('Country', req.parameters.ven_country)}
          </table>
          ${mailingHTML}
        </div>

        <div class="section">
          <h3>Contacts</h3>
          <table class="tbl">
            <tr><td class="k">Purchasing Contact</td><td class="v">
              ${esc(req.parameters.purch_contact_name)}<br>
              ${esc(req.parameters.purch_title)}<br>
              Tel: ${esc(req.parameters.purch_phone)}${req.parameters.purch_ext ? ' Ext ' + esc(req.parameters.purch_ext) : ''}<br>
              ${req.parameters.purch_alt_phone ? 'Alt: ' + esc(req.parameters.purch_alt_phone) + (req.parameters.purch_alt_ext ? ' Ext ' + esc(req.parameters.purch_alt_ext) : '') + '<br>' : ''}
              Email: ${esc(req.parameters.purch_email)}
            </td></tr>
            <tr><td class="k">Accounting Contact</td><td class="v">
              ${esc(req.parameters.acc_contact_name)}<br>
              ${esc(req.parameters.acc_title)}<br>
              Tel: ${esc(req.parameters.acc_phone)}${req.parameters.acc_ext ? ' Ext ' + esc(req.parameters.acc_ext) : ''}<br>
              ${req.parameters.acc_alt_phone ? 'Alt: ' + esc(req.parameters.acc_alt_phone) + (req.parameters.acc_alt_ext ? ' Ext ' + esc(req.parameters.acc_alt_ext) : '') + '<br>' : ''}
              Email: ${esc(req.parameters.acc_email)}
            </td></tr>
          </table>
        </div>

        <div class="section">
          <h3>Bank & Payment</h3>
          <table class="tbl">
            ${row('Bank Name', req.parameters.bank_name)}
            ${row('Bank Address', req.parameters.bank_address)}
            ${row('PO Box', req.parameters.bank_po_box)}
            ${row('City', req.parameters.bank_city)}
            ${row('State/Province', grabStateName(req.parameters.bank_state))}
            ${row('Postal/ZIP', req.parameters.bank_zip)}
            ${row('Country', req.parameters.bank_country)}
            ${row('Branch Telephone', req.parameters.branch_telephone)}
            ${row('Bank Contact', req.parameters.bank_contact)}
            ${row('Bank Contact Email', req.parameters.bank_contact_email)}  <!-- NEW -->
            ${row('Payment Terms', paymentTermName || req.parameters.payment_terms)} <!-- now shows label -->
            ${row('Other Terms', req.parameters.payment_other)}
            ${row('Remittance Email', req.parameters.remit_email)}
          </table>

          <h3 style="margin-top:16px;">Payment Method Details</h3>
          <table class="tbl">${paymentDetailsHTML}</table>
        </div>

        <div class="section">
          <h3>Authorization</h3>
          <table class="tbl">
            ${row('Name', req.parameters.auth_name)}
            ${row('Title', req.parameters.auth_title)}
            ${row('Date', req.parameters.auth_date)}
            ${row('Digital Signature (typed)', req.parameters.auth_signature)}
            ${row('Confirmation Email', req.parameters.auth_email)}
            ${row('Trusscore Contact Email', req.parameters.auth_tc_email)}
          </table>
        </div>

        <div class="footer">
          You’re receiving this confirmation because the Vendor Onboarding form was submitted. We will never update banking information based solely on an email request; changes are always validated by phone.<br><br>
          Questions? Email <b>ap@trusscore.com</b>.
        </div>
      </div>
    </body>
  </html>`;

                            if (recipient) {
                                email.send({
                                    author: authorId,
                                    recipients: [recipient],
                                    subject: subject,
                                    body: body
                                });
                                log.audit('Submission email sent', { to: recipient, recId: recId });
                            } else {
                                log.error('Email skipped', 'No authorized email (auth_email) provided.');
                            }
                        } catch (e) {
                            log.error('Error sending confirmation email', e);
                        }

                    }

                    // ===== RESPONSE PAGES =====
                    if (isDraft) {
                        var draftHTML = `
          <html><head>
            <style>
              body{font-family:Arial,sans-serif;background:#1c1c1c;color:#f0f0f0;text-align:center;padding-top:80px;}
              .box{background:#2b2b2b;padding:28px;margin:auto;border-radius:10px;width:560px;box-shadow:0 0 10px #ffa500;}
              a{color:#ffc107;text-decoration:underline;}
              .btn{display:inline-block;margin-top:14px;padding:10px 16px;background:#ffc107;color:#222;border-radius:8px;text-decoration:none;font-weight:700}
            </style>
          </head><body>
            <div class="box">
              <h2>Draft saved</h2>
              <p>Your progress has been saved. Draft ID: <b>#${tokenForLinks}</b></p>
              <p>You can return later to complete the form.</p>
              <p>
                <a class="btn" href="${resumeUrl}">Open this draft again</a>
              </p>
            </div>
          </body></html>`;
                        context.response.write(draftHTML);
                    } else {
                        var confirmationHTML = `
          <html>
          <head>
            <meta http-equiv="refresh" content="5;url=https://6518122.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=5804&deploy=1&compid=6518122&ns-at=AAEJ7tMQi6u9BSsGXBpBYNAigeywBkbWHEZcIMttBNGYZM87sqY" />
            <style>
              body { font-family: Arial, sans-serif; background-color: #1c1c1c; color: #f0f0f0; text-align: center; padding-top: 100px; }
              .box { background-color: #2b2b2b; padding: 30px; margin: auto; border-radius: 10px; width: 500px; box-shadow: 0 0 10px #ffa500; }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>Thank you!</h2>
              <p>Your information has been submitted successfully.</p>
              <p>You will be redirected to the main page in 5 seconds.</p>
            </div>
          </body>
          </html>`;
                        context.response.write(confirmationHTML);
                    }

                } catch (err) {
                    log.error('Error processing POST', err);
                    showSuiteletError(context, err.message);
                    // context.response.write('An error occurred while submitting the form: ' + err.message);
                }
            }
        }

        function countryId(selected) {
            var list = {
                'Canada': 37,
                'United States': 230,
                'Mexico': 157,
                'United Kingdom': 77,
                'Saint Lucia': 128,
                'Puerto Rico': 182,
                'Guyana': 94,
                'Chile': 45,
                'Barbados': 18,
                'China': 47
            }

            return list[selected] || null;
        }

        function showSuiteletError(context, message) {

            // Create a form
            var form = serverWidget.createForm({ title: 'Error' });

            // Add an inline HTML field to show the message
            form.addField({
                id: 'custpage_error_message',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Error Message'
            }).defaultValue = '<div style="color: red; font-weight: bold; padding: 15px; border: 1px solid red; background-color: #ffe6e6; font-size: 14px;">' +
            '<h3>An error occurred</h3>' +
            '<p>' + message + '</p>' +
                '</div>';

            // Render the form
            context.response.writePage(form);
        }

        return { onRequest };
    });
