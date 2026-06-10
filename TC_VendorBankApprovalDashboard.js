/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * TC | Vendor Bank Details Approval Dashboard
 * --------------------------------------------------
 * Payment hold source of truth: custentity_tc_onhold_payments on Vendor
 * Workflow state (customworkflow_bank_detail_approval_flow) = reason column
 *
 * Hold logic:
 *   custentity_tc_onhold_payments = T   → ON HOLD
 *   custentity_tc_onhold_payments = F/null → CLEARED
 *
 * Workflow states shown as reason:
 *   Not Submitted        → workflow never triggered
 *   Pending Approval-AP  → awaiting AP
 *   Finance Approval     → awaiting Finance
 *   Rejected (AP)        → rejected by AP
 *   Rejected             → rejected by Finance
 *   Update               → update in progress
 *   Stop Using bank details → deactivated
 *   Approved             → approved
 */

define(['N/search', 'N/workflow', 'N/url', 'N/log'], (search, workflow, url, log) => {

    const BANK_RECORD_TYPE = 'customrecord_2663_entity_bank_details';
    const WORKFLOW_ID      = 'customworkflow_bank_detail_approval_flow';

    const WORKFLOW_STATE_LABELS = {
        'Not Submitted':           'Not Submitted — workflow not started',
        'Submit':                  'Not Submitted — workflow not started',
        'Pending Approval-AP':     'Pending AP approval',
        'Finance Approval':        'Pending Finance approval',
        'Rejected (AP)':           'Rejected by AP — resubmission required',
        'Rejected':                'Rejected by Finance — resubmission required',
        'Update':                  'Bank details update in progress',
        'Stop Using bank details': 'Bank details deactivated',
        'Approved':                'Approved',
    };

    const WORKFLOW_BADGE = {
        'Not Submitted':           { style: 'gray'   },
        'Submit':                  { style: 'gray'   },
        'Pending Approval-AP':     { style: 'amber'  },
        'Finance Approval':        { style: 'purple' },
        'Rejected (AP)':           { style: 'red'    },
        'Rejected':                { style: 'red'    },
        'Approved':                { style: 'green'  },
        'Update':                  { style: 'amber'  },
        'Stop Using bank details': { style: 'gray'   },
    };

    const BADGE_STYLES = {
        green:  { bg: '#d4edda', color: '#155724', border: '#28a745', dot: '#34a853' },
        amber:  { bg: '#fff3cd', color: '#7a5000', border: '#ffc107', dot: '#f9ab00' },
        red:    { bg: '#f8d7da', color: '#721c24', border: '#dc3545', dot: '#ea4335' },
        purple: { bg: '#ede7f6', color: '#4a148c', border: '#9c27b0', dot: '#7b1fa2' },
        gray:   { bg: '#f1f3f4', color: '#444444', border: '#cccccc', dot: '#888888' },
    };

    // ─── ENTRY POINT ─────────────────────────────────────────────────────────

    const onRequest = (context) => {
        if (context.request.method !== 'GET') return;
        const filterParam = context.request.parameters.filter || 'all';
        try {
            const vendors = loadVendorData();
            context.response.write(renderPage(vendors, filterParam));
        } catch (e) {
            log.error('Dashboard error', e.message);
            context.response.write(renderError(e.message));
        }
    };

    // ─── DATA LOADING ─────────────────────────────────────────────────────────

    const loadVendorData = () => {

        // Step 1 — load all bank details records + join vendor on-hold field
        const bankSearch = search.create({
            type: BANK_RECORD_TYPE,
            filters: [['isinactive', 'anyof', ['T', 'F']]],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'name' }),
                search.createColumn({ name: 'custrecord_2663_parent_vendor' }),
                search.createColumn({ name: 'custrecord_2663_entity_bank_name' }),
                search.createColumn({ name: 'custrecord_2663_entity_bank_type' }),
                search.createColumn({ name: 'custrecord_9572_subsidiary' }),
                search.createColumn({ name: 'isinactive' }),
                search.createColumn({ name: 'lastmodified' }),
                // Join to vendor to get the On Hold for Payments field
                search.createColumn({
                    name:  'custentity_tc_onhold_payments',
                    join:  'custrecord_2663_parent_vendor',
                }),
            ],
        });

        const bankRecords = [];
        bankSearch.run().each((result) => {
            const onHoldRaw = result.getValue({
                name: 'custentity_tc_onhold_payments',
                join: 'custrecord_2663_parent_vendor',
            });
            bankRecords.push({
                id:           result.id,
                vendorId:     result.getValue('custrecord_2663_parent_vendor'),
                vendorName:   result.getText('custrecord_2663_parent_vendor') || result.getValue('name'),
                bankName:     result.getValue('custrecord_2663_entity_bank_name') || '',
                bankType:     result.getText('custrecord_2663_entity_bank_type') || '',
                subsidiary:   result.getText('custrecord_9572_subsidiary') || '',
                inactive:     result.getValue('isinactive') === 'T',
                lastMod:      result.getValue('lastmodified') || '',
                // TRUE only when explicitly checked — F and null = not on hold
                paymentHold:  onHoldRaw === 'T',
            });
            return true;
        });

        // Step 2 — get workflow state per record (reason column)
        return bankRecords.map((r) => {
            const wfState    = getWorkflowState(r);
            const badgeCfg   = WORKFLOW_BADGE[wfState] || { style: 'gray' };
            const stateLabel = WORKFLOW_STATE_LABELS[wfState] || wfState;

            return {
                ...r,
                workflowState:  wfState,
                workflowLabel:  stateLabel,
                wfBadgeStyle:   badgeCfg.style,
                recordUrl: url.resolveRecord({ recordType: BANK_RECORD_TYPE, recordId: r.id, isEditMode: false }),
                vendorUrl: r.vendorId ? url.resolveRecord({ recordType: 'vendor', recordId: r.vendorId, isEditMode: false }) : '',
            };
        });
    };

    /**
     * Read live workflow state via N/workflow.getState().
     * Returns state name string, or 'Not Submitted' if workflow never initiated.
     */
    const getWorkflowState = (record) => {
        try {
            const stateInfo = workflow.getState({
                recordType: BANK_RECORD_TYPE,
                recordId:   record.id,
                workflowId: WORKFLOW_ID,
            });
            return (stateInfo && stateInfo.name) ? stateInfo.name : 'Not Submitted';
        } catch (e) {
            if (e.name === 'SSS_WORKFLOW_NOT_INITIATED' || e.message.includes('not been initiated')) {
                return record.inactive ? 'Stop Using bank details' : 'Not Submitted';
            }
            log.debug('getState error for record ' + record.id, e.message);
            return record.inactive ? 'Stop Using bank details' : 'Not Submitted';
        }
    };

    // ─── HTML RENDERING ───────────────────────────────────────────────────────

    const renderPage = (vendors, activeFilter) => {
        const filtered = applyFilter(vendors, activeFilter);
        const counts = {
            all:      vendors.length,
            hold:     vendors.filter(v => v.paymentHold).length,
            cleared:  vendors.filter(v => !v.paymentHold).length,
            pending:  vendors.filter(v => v.workflowState === 'Pending Approval-AP').length,
            finance:  vendors.filter(v => v.workflowState === 'Finance Approval').length,
            rejected: vendors.filter(v => ['Rejected', 'Rejected (AP)'].includes(v.workflowState)).length,
            approved: vendors.filter(v => v.workflowState === 'Approved').length,
        };
        const now = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Vendor Bank Details Approval Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,sans-serif;background:#f4f6f8;color:#222;font-size:14px}
.header{background:#003764;padding:16px 28px;display:flex;justify-content:space-between;align-items:center}
.header-title{color:#fff;font-size:17px;font-weight:600}
.header-sub{color:#B8D4E8;font-size:12px;margin-top:3px}
.header-meta{color:#B8D4E8;font-size:11px;text-align:right;line-height:1.6}
.kpi-row{display:flex;gap:12px;padding:18px 28px 0;flex-wrap:wrap}
.kpi-card{background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:14px 18px;flex:1;min-width:110px}
.kpi-label{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.kpi-value{font-size:28px;font-weight:700;line-height:1}
.kpi-sub{font-size:11px;color:#888;margin-top:3px}
.kpi-blue{color:#003764}.kpi-red{color:#c62828}.kpi-green{color:#2e7d32}.kpi-amber{color:#e65100}.kpi-purple{color:#6a1b9a}
.toolbar{display:flex;align-items:center;gap:10px;padding:14px 28px;flex-wrap:wrap}
.search-input{flex:1;min-width:180px;max-width:280px;padding:6px 12px;border:1px solid #ccc;border-radius:6px;font-size:13px;font-family:inherit;outline:none}
.search-input:focus{border-color:#003764}
.filter-btn{padding:5px 14px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid #ccc;background:#fff;color:#444;font-family:inherit}
.filter-btn.active{background:#003764;color:#fff;border-color:#003764;font-weight:600}
.filter-btn:hover:not(.active){background:#f0f0f0}
.chip{display:inline-block;background:rgba(255,255,255,.25);border-radius:10px;padding:1px 6px;font-size:11px;margin-left:3px}
.filter-btn:not(.active) .chip{background:#eee;color:#666}
.legend{margin:0 28px 6px;font-size:11px;color:#888}
.table-wrap{margin:0 28px 28px;background:#fff;border-radius:8px;border:1px solid #e0e0e0;overflow:auto}
table{width:100%;border-collapse:collapse;min-width:780px}
thead th{padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#003764;font-weight:700;border-bottom:2px solid #003764;background:#f7f9fb;white-space:nowrap}
tbody tr:hover{background:#f7f9fb}
tbody td{padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:13px;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
.empty-row td{text-align:center;color:#888;padding:32px}
.badge{display:inline-flex;align-items:center;gap:5px;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:500;border:1px solid transparent;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.hold-yes{color:#c62828;font-weight:700;font-size:12px}
.hold-no{color:#2e7d32;font-weight:700;font-size:12px}
.wf-reason{font-size:11px;color:#666;max-width:220px}
a{color:#36677D;text-decoration:none}
a:hover{text-decoration:underline}
.action-link{font-size:12px;color:#36677D;border:1px solid #36677D;border-radius:4px;padding:2px 8px;white-space:nowrap}
.action-link:hover{background:#36677D;color:#fff;text-decoration:none}
.footer{text-align:center;padding:14px;color:#aaa;font-size:11px}
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="header-title">Vendor Bank Details &mdash; Approval Dashboard</div>
    <div class="header-sub">Hold status from vendor field &nbsp;&middot;&nbsp; Workflow reason from TC | Bank Detail Approval Flow</div>
  </div>
  <div class="header-meta">${now}<br>${vendors.length} bank detail records</div>
</div>

<div class="kpi-row">
  <div class="kpi-card"><div class="kpi-label">Total Records</div><div class="kpi-value kpi-blue">${counts.all}</div></div>
  <div class="kpi-card"><div class="kpi-label">On Payment Hold</div><div class="kpi-value kpi-red">${counts.hold}</div><div class="kpi-sub">Payments blocked</div></div>
  <div class="kpi-card"><div class="kpi-label">Cleared for Payment</div><div class="kpi-value kpi-green">${counts.cleared}</div><div class="kpi-sub">Hold field unchecked</div></div>
  <div class="kpi-card"><div class="kpi-label">Pending AP</div><div class="kpi-value kpi-amber">${counts.pending}</div><div class="kpi-sub">Workflow state</div></div>
  <div class="kpi-card"><div class="kpi-label">Finance Review</div><div class="kpi-value kpi-purple">${counts.finance}</div><div class="kpi-sub">Workflow state</div></div>
  <div class="kpi-card"><div class="kpi-label">Rejected</div><div class="kpi-value kpi-red">${counts.rejected}</div><div class="kpi-sub">AP or Finance</div></div>
  <div class="kpi-card"><div class="kpi-label">Approved</div><div class="kpi-value kpi-green">${counts.approved}</div><div class="kpi-sub">Workflow state</div></div>
</div>

<div class="toolbar">
  <input class="search-input" type="text" id="searchBox" placeholder="Search vendor name&hellip;" oninput="filterTable()"/>
  ${renderFilterBtn('all',      `All<span class="chip">${counts.all}</span>`,            activeFilter)}
  ${renderFilterBtn('hold',     `On Hold<span class="chip">${counts.hold}</span>`,       activeFilter)}
  ${renderFilterBtn('cleared',  `Cleared<span class="chip">${counts.cleared}</span>`,    activeFilter)}
  ${renderFilterBtn('pending',  `Pending AP<span class="chip">${counts.pending}</span>`, activeFilter)}
  ${renderFilterBtn('finance',  `Finance<span class="chip">${counts.finance}</span>`,    activeFilter)}
  ${renderFilterBtn('rejected', `Rejected<span class="chip">${counts.rejected}</span>`,  activeFilter)}
  ${renderFilterBtn('approved', `Approved<span class="chip">${counts.approved}</span>`,  activeFilter)}
</div>

<div class="legend">
  &#9432; <strong>Payment Hold</strong> = <code>custentity_tc_onhold_payments</code> on Vendor record &nbsp;&middot;&nbsp;
  <strong>Workflow State</strong> = live from <code>customworkflow_bank_detail_approval_flow</code>
</div>

<div class="table-wrap">
  <table id="vendorTable">
    <thead>
      <tr>
        <th>Vendor</th>
        <th>Payment Hold</th>
        <th>Workflow State</th>
        <th>Bank Name</th>
        <th>Bank Type</th>
        <th>Subsidiary</th>
        <th>Workflow Reason</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${filtered.length === 0
        ? '<tr class="empty-row"><td colspan="8">No vendors match the selected filter.</td></tr>'
        : filtered.map(renderVendorRow).join('')}
    </tbody>
  </table>
</div>

<div class="footer">TC | Vendor Bank Details Approval Dashboard &nbsp;&middot;&nbsp; SuiteScript 2.1</div>

<script>
function filterTable(){
  var q=document.getElementById('searchBox').value.toLowerCase();
  document.querySelectorAll('#vendorTable tbody tr').forEach(function(row){
    if(row.classList.contains('empty-row'))return;
    row.style.display=row.textContent.toLowerCase().includes(q)?'':'none';
  });
}
</script>
</body>
</html>`;
    };

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    const applyFilter = (vendors, filter) => {
        switch (filter) {
            case 'hold':     return vendors.filter(v => v.paymentHold);
            case 'cleared':  return vendors.filter(v => !v.paymentHold);
            case 'pending':  return vendors.filter(v => v.workflowState === 'Pending Approval-AP');
            case 'finance':  return vendors.filter(v => v.workflowState === 'Finance Approval');
            case 'rejected': return vendors.filter(v => ['Rejected', 'Rejected (AP)'].includes(v.workflowState));
            case 'approved': return vendors.filter(v => v.workflowState === 'Approved');
            default:         return vendors;
        }
    };

    const renderFilterBtn = (value, label, active) =>
        `<a href="?filter=${value}" style="text-decoration:none;"><button class="filter-btn${active === value ? ' active' : ''}">${label}</button></a>`;

    const renderVendorRow = (v) => {
        const wfStyle  = BADGE_STYLES[v.wfBadgeStyle] || BADGE_STYLES.gray;
        const wfBadge  = `<span class="badge" style="background:${wfStyle.bg};color:${wfStyle.color};border-color:${wfStyle.border};"><span class="dot" style="background:${wfStyle.dot};"></span>${escHtml(v.workflowState === 'Submit' ? 'Not Submitted' : v.workflowState)}</span>`;
        const hold     = v.paymentHold ? '<span class="hold-yes">&#128274; YES</span>' : '<span class="hold-no">&#10003; NO</span>';
        const vLink    = v.vendorUrl ? `<a href="${v.vendorUrl}" target="_blank">${escHtml(v.vendorName)}</a>` : escHtml(v.vendorName);
        const act      = v.recordUrl ? `<a href="${v.recordUrl}" target="_blank" class="action-link">View Record</a>` : '&mdash;';
        return `<tr>
          <td>${vLink}</td>
          <td>${hold}</td>
          <td>${wfBadge}</td>
          <td>${escHtml(v.bankName)||'&mdash;'}</td>
          <td>${escHtml(v.bankType)||'&mdash;'}</td>
          <td style="font-size:12px;color:#666;">${escHtml(v.subsidiary)||'&mdash;'}</td>
          <td class="wf-reason">${escHtml(v.workflowLabel)||'&mdash;'}</td>
          <td>${act}</td>
        </tr>`;
    };

    const renderError = (msg) =>
        `<div style="font-family:Segoe UI,sans-serif;padding:40px;text-align:center;">
           <div style="font-size:32px;margin-bottom:12px;">&#9888;&#65039;</div>
           <div style="font-size:16px;font-weight:600;color:#c62828;margin-bottom:8px;">Dashboard error</div>
           <div style="font-size:13px;color:#666;">${escHtml(msg)}</div>
           <div style="margin-top:16px;font-size:12px;color:#aaa;">Check: Customization &rarr; Scripting &rarr; Script Deployments &rarr; Execution Log</div>
         </div>`;

    const escHtml = (str) => String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    return { onRequest };
});