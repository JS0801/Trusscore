/**
 * PO Service Item Receiving — Suitelet (HTML UI + per-row file upload + per-line subsidiary-aware locations)
 * - NO Suitelet calls for data load (data embedded in HTML on GET)
 * - Single multipart POST on Receive (uploads + payload)
 * - Location dropdown options filtered by EACH ROW subsidiary (row.subsidiaryId)
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define([
  'N/search', 'N/record', 'N/log', 'N/runtime', 'N/format', 'N/redirect', 'N/file'
], function (search, record, log, runtime, format, redirect, file) {

  var ACTION_FLID = 'action';
  var PAYLOAD_FLID = 'payload';
  var FILTER_FLID = 'filters';

  var ACTION_GET = 'get';
  var ACTION_LOCLIST = 'loclist';
  var ACTION_RECEIVE_API = 'receive';

  var ACTION_RECEIVE = 'receive';

  var SEARCH_ID = 'customsearch_tc_purchase_order_with_serv';
  //added by sim : start
  var ROLE_ADMIN = 3;
  var ROLE_CONTROLLER = 1365;
  var ROLE_AP_ANALYST = 1364;

  var ALLOWED_FULL_ACCESS_ROLES = [
    ROLE_ADMIN,
    ROLE_CONTROLLER,
    ROLE_AP_ANALYST
  ];
  //added by sim : end

  // Upload folder
  // var UPLOAD_FOLDER_ID = 319519; // SB
  var UPLOAD_FOLDER_ID = 366486;// PROD 

  function onRequest(ctx) {
    log.audit('SL:onRequest:start', { method: ctx.request.method, params: ctx.request.parameters });

    try {
      var req = ctx.request;

      // =========================================================
      // ✅ ROUTING FIX:
      // Only treat as JSON API when mode=api (Portlet)
      // HTML Suitelet page + HTML Receive POST stays normal (PRG redirect)
      // =========================================================
      var mode = String(req.parameters.mode || '').toLowerCase();
      var apiAction = String(req.parameters.action || '').toLowerCase();

      // ---------- Portlet JSON API mode ----------
      if (mode === 'api') {
        if (apiAction === ACTION_GET) {
          return apiGet(ctx);
        }
        if (apiAction === ACTION_LOCLIST) {
          return apiLocList(ctx);
        }
        if (apiAction === ACTION_RECEIVE_API) {
          return apiReceiveMultipart(ctx);
        }

        ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        ctx.response.write(JSON.stringify({
          ok: false,
          message: 'Unknown API action: ' + apiAction
        }));
        return;
      }

      // =========================================================
      // ---------- HTML UI mode ----------
      // =========================================================
      if (req.method === 'POST') {
        var action = String(req.parameters[ACTION_FLID] || '').toLowerCase();

        if (action === ACTION_RECEIVE) {
          handleReceiveHTML(ctx);

          var cs = runtime.getCurrentScript();
          redirect.toSuitelet({
            scriptId: cs.id,
            deploymentId: cs.deploymentId,
            parameters: { reset: 'T' }
          });
          return;
        }
      }

      // ---------- GET render (HTML page) ----------
      var filters = readFilters(req);

      var rows = runSearch({
        poPickIds: filters.poPickIds,
        subsId: filters.subsidiary,
        dateFrom: filters.datefrom,
        dateTo: filters.dateto
      });

      var poOptions = buildPoOptionsFromRows(rows);

      var locations = listLocationsAllPaged();

      renderHtmlPage(ctx, filters, poOptions, rows, locations);

    } catch (e) {
      log.error('SL:onRequest:error', serializeErr(e));

      ctx.response.write(
        '<div style="font-family:sans-serif;color:#b00020;padding:12px;">' +
        '<b>Error:</b> ' + escapeHtml(e.message || String(e)) +
        '</div>'
      );
    } finally {
      log.audit('SL:onRequest:end', {});
    }
  }

  function apiGet(ctx) {
    var req = ctx.request;

    var filters = {
      subsidiary: String(req.parameters.subsidiary || '').trim(),
      datefrom: String(req.parameters.datefrom || '').trim(),
      dateto: String(req.parameters.dateto || '').trim(),
      poPickIds: cleanIds(String(req.parameters.popickid || '').split(','))
    };

    var rows = runSearch({
      poPickIds: filters.poPickIds,
      subsId: filters.subsidiary,
      dateFrom: filters.datefrom,
      dateTo: filters.dateto
    });

    var poOptions = buildPoOptionsFromRows(rows);

    ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    ctx.response.write(JSON.stringify({
      ok: true,
      filters: filters,
      poOptions: poOptions,
      rows: rows
    }));
  }

  function apiLocList(ctx) {
    var req = ctx.request;
    var subsId = String(req.parameters.subsidiary || '').trim();

    var list = [];
    var locFilters = [
      ["makeinventoryavailable", "is", "T"], "AND",
      ["isinactive", "is", "F"]
    ];
    if (subsId) locFilters.push("AND", ["subsidiary", "anyof", subsId]);

    var s = search.create({
      type: "location",
      filters: locFilters,
      columns: [
        search.createColumn({ name: "internalid" }),
        search.createColumn({ name: "name" })
      ]
    });

    s.run().each(function (r) {
      list.push({
        id: String(r.getValue({ name: "internalid" }) || ''),
        name: String(r.getValue({ name: "name" }) || '')
      });
      return true;
    });

    ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    ctx.response.write(JSON.stringify({ ok: true, subsidiary: subsId, locations: list }));
  }

  //   function apiReceiveMultipart(ctx){
  //     var req = ctx.request;

  //     var payloadStr = req.parameters.payload || '[]';
  //     var arr = [];
  //     try{
  //       arr = JSON.parse(payloadStr) || [];
  //     } catch(e){
  //       ctx.response.setHeader({ name:'Content-Type', value:'application/json' });
  //       ctx.response.write(JSON.stringify({ ok:false, message:'Invalid payload JSON', error: serializeErr(e) }));
  //       return;
  //     }

  //     var fileIdByKey = {};
  //     var filesObj = req.files || {};

  //     for (var k in filesObj){
  //       if (!filesObj.hasOwnProperty(k)) continue;
  //       var upl = filesObj[k];
  //       if (!upl) continue;

  //       try{
  //         upl.folder = UPLOAD_FOLDER_ID;
  //         var fid = upl.save();
  //         fileIdByKey[String(k)] = Number(fid);
  //         log.audit('PORTLET:UPLOAD:SAVED', { key:k, fileId:fid, name: upl.name });
  //       }catch(e){
  //         log.error('PORTLET:UPLOAD:ERROR', { key:k, err: serializeErr(e) });
  //       }
  //     }

  //     var byPo = {};
  //     for (var i=0;i<arr.length;i++){
  //       var row = arr[i];
  //       if (!row || !row.poId || (!row.lineUk && !row.lineNo)) continue;

  //       var fid2 = 0;
  //       if (row.fileKey) fid2 = Number(fileIdByKey[String(row.fileKey)] || 0);

  //       var groupKey = String(row.poId) + '|' + String(row.recDate || '');
  // if (!byPo[groupKey]) byPo[groupKey] = {
  //   poId: Number(row.poId),
  //   recDate: String(row.recDate || ''),
  //   lines: []
  // };
  //       byPo[groupKey].lines.push({
  //         orderlineUk: Number(row.lineUk) || 0,
  //         lineNo:      Number(row.lineNo) || 0,
  //         qty:         Number(row.qty)    || 0,
  //         location:    Number(row.locId)  || 0,
  //         date:        row.recDate,
  //         fileId:      fid2
  //       });
  //     }

  //     var results = [];
  //     var poIds = Object.keys(byPo);

  //     for (var p=0;p<poIds.length;p++){
  //       var poIdStr = poIds[p];
  //       try{
  //         var irId = createItemReceiptForLines(Number(poIdStr), byPo[poIdStr]);
  //         results.push({ poId: Number(poIdStr), ok:true, irId: irId || null });
  //       } catch(e){
  //         results.push({ poId: Number(poIdStr), ok:false, error: serializeErr(e) });
  //       }
  //     }

  //     ctx.response.setHeader({ name:'Content-Type', value:'application/json' });
  //     ctx.response.write(JSON.stringify({ ok:true, results: results }));
  //   }

  function apiReceiveMultipart(ctx) {
    var req = ctx.request;

    var payloadStr = req.parameters.payload || '[]';
    var arr = [];
    try {
      arr = JSON.parse(payloadStr) || [];
    } catch (e) {
      ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
      ctx.response.write(JSON.stringify({ ok: false, message: 'Invalid payload JSON', error: serializeErr(e) }));
      return;
    }

    var fileIdByKey = {};
    var filesObj = req.files || {};

    for (var k in filesObj) {
      if (!filesObj.hasOwnProperty(k)) continue;
      var upl = filesObj[k];
      if (!upl) continue;

      try {
        upl.folder = UPLOAD_FOLDER_ID;
        var fid = upl.save();
        fileIdByKey[String(k)] = Number(fid);
        log.audit('PORTLET:UPLOAD:SAVED', { key: k, fileId: fid, name: upl.name });
      } catch (e) {
        log.error('PORTLET:UPLOAD:ERROR', { key: k, err: serializeErr(e) });
      }
    }

    // Group by PO + Date
    var byPoDate = {};
    for (var i = 0; i < arr.length; i++) {
      var row = arr[i];
      if (!row || !row.poId || (!row.lineUk && !row.lineNo)) continue;

      var fid2 = 0;
      if (row.fileKey) fid2 = Number(fileIdByKey[String(row.fileKey)] || 0);

      var recDate = String(row.recDate || '').trim();
      var groupKey = String(row.poId) + '|' + recDate;

      if (!byPoDate[groupKey]) {
        byPoDate[groupKey] = {
          poId: Number(row.poId),
          recDate: recDate,
          lines: []
        };
      }

      byPoDate[groupKey].lines.push({
        orderlineUk: Number(row.lineUk) || 0,
        lineNo: Number(row.lineNo) || 0,
        qty: Number(row.qty) || 0,
        location: Number(row.locId) || 0,
        date: recDate,
        fileId: fid2
      });
    }

    var results = [];
    var groupKeys = Object.keys(byPoDate);

    for (var p = 0; p < groupKeys.length; p++) {
      var grp = byPoDate[groupKeys[p]];
      try {
        var irId = createItemReceiptForLines(grp.poId, grp.lines);
        results.push({
          poId: grp.poId,
          recDate: grp.recDate,
          ok: true,
          irId: irId || null
        });
      } catch (e) {
        results.push({
          poId: grp.poId,
          recDate: grp.recDate,
          ok: false,
          error: serializeErr(e)
        });
      }
    }

    ctx.response.setHeader({ name: 'Content-Type', value: 'application/json' });
    ctx.response.write(JSON.stringify({ ok: true, results: results }));
  }

  // function handleReceiveHTML(ctx){
  //   var req = ctx.request;

  //   var payloadStr = req.parameters[PAYLOAD_FLID] || '[]';
  //   var arr = [];
  //   try {
  //     arr = JSON.parse(payloadStr) || [];
  //   } catch (e) {
  //     throw new Error('Invalid payload JSON.');
  //   }

  //   var fileMap = {};
  //   var filesObj = req.files || {};

  //   for (var key in filesObj) {
  //     if (!filesObj.hasOwnProperty(key)) continue;
  //     var upl = filesObj[key];
  //     if (!upl) continue;

  //     try {
  //       upl.folder = UPLOAD_FOLDER_ID;
  //       var fid = upl.save();

  //       var parsed = parseFileFieldName(key);
  //       if (parsed && parsed.poId && parsed.lineUk) {
  //         fileMap[String(parsed.poId) + '|' + String(parsed.lineUk)] = Number(fid);
  //       }
  //       log.audit('UPLOAD:SAVED', { field: key, fileId: fid, name: upl.name });
  //     } catch (e) {
  //       log.error('UPLOAD:ERROR', { field: key, err: serializeErr(e) });
  //     }
  //   }

  //   var byPo = {};
  //   for (var i=0; i<arr.length; i++){
  //     var row = arr[i];
  //     if (!row || !row.poId || (!row.lineUk && !row.lineNo)) continue;

  //     var key2 = String(row.poId) + '|' + String(row.lineUk || 0);
  //     var fid2 = fileMap[key2] || 0;

  //     if (!byPo[row.poId]) byPo[row.poId] = [];
  //     byPo[row.poId].push({
  //       orderlineUk: Number(row.lineUk) || 0,
  //       lineNo:      Number(row.lineNo) || 0,
  //       qty:         Number(row.qty)    || 0,
  //       location:    Number(row.locId)  || 0,
  //       date:        row.recDate,
  //       fileId:      Number(fid2) || 0
  //     });
  //   }

  //   log.audit('SL:POST:payload:groupedByPO', byPo);

  //   Object.keys(byPo).forEach(function(poIdStr){
  //     var poIdNum = Number(poIdStr);
  //     try{
  //       var irId = createItemReceiptForLines(poIdNum, byPo[poIdStr]);
  //       log.audit('SL:POST:IR', { poId: poIdNum, irId: irId });
  //     } catch(e){
  //       log.error('SL:POST:IR:error', serializeErr(e));
  //     }
  //   });
  // }


  function handleReceiveHTML(ctx) {
    var req = ctx.request;

    var payloadStr = req.parameters[PAYLOAD_FLID] || '[]';
    var arr = [];
    try {
      arr = JSON.parse(payloadStr) || [];
    } catch (e) {
      throw new Error('Invalid payload JSON.');
    }

    var fileMap = {};
    var filesObj = req.files || {};

    for (var key in filesObj) {
      if (!filesObj.hasOwnProperty(key)) continue;
      var upl = filesObj[key];
      if (!upl) continue;

      try {
        upl.folder = UPLOAD_FOLDER_ID;
        var fid = upl.save();

        var parsed = parseFileFieldName(key);
        if (parsed && parsed.poId && parsed.lineUk) {
          fileMap[String(parsed.poId) + '|' + String(parsed.lineUk)] = Number(fid);
        }
        log.audit('UPLOAD:SAVED', { field: key, fileId: fid, name: upl.name });
      } catch (e) {
        log.error('UPLOAD:ERROR', { field: key, err: serializeErr(e) });
      }
    }

    // Group by PO + Date
    var byPoDate = {};
    for (var i = 0; i < arr.length; i++) {
      var row = arr[i];
      if (!row || !row.poId || (!row.lineUk && !row.lineNo)) continue;

      var fileKey = String(row.poId) + '|' + String(row.lineUk || 0);
      var fid = fileMap[fileKey] || 0;

      var recDate = String(row.recDate || '').trim();
      var groupKey = String(row.poId) + '|' + recDate;

      if (!byPoDate[groupKey]) {
        byPoDate[groupKey] = {
          poId: Number(row.poId),
          recDate: recDate,
          lines: []
        };
      }

      byPoDate[groupKey].lines.push({
        orderlineUk: Number(row.lineUk) || 0,
        lineNo: Number(row.lineNo) || 0,
        qty: Number(row.qty) || 0,
        location: Number(row.locId) || 0,
        date: recDate,
        fileId: Number(fid) || 0
      });
    }

    log.audit('SL:POST:payload:groupedByPODate', byPoDate);

    Object.keys(byPoDate).forEach(function (groupKey) {
      var grp = byPoDate[groupKey];
      try {
        var irId = createItemReceiptForLines(grp.poId, grp.lines);
        log.audit('SL:POST:IR', {
          poId: grp.poId,
          recDate: grp.recDate,
          irId: irId
        });
      } catch (e) {
        log.error('SL:POST:IR:error', {
          poId: grp.poId,
          recDate: grp.recDate,
          err: serializeErr(e)
        });
      }
    });
  }

  function parseFileFieldName(fieldName) {
    try {
      var s = String(fieldName || '');
      if (s.indexOf('file__') !== 0) return null;
      var parts = s.split('__');
      if (parts.length < 3) return null;
      return { poId: Number(parts[1]) || 0, lineUk: Number(parts[2]) || 0 };
    } catch (_) { return null; }
  }

  function renderHtmlPage(ctx, filters, poOptions, rows, locations) {
    var dataJson = JSON.stringify({
      filters: filters,
      poOptions: poOptions,
      rows: rows,
      locations: locations,
      canSeeAllPOs: userCanSeeAllPOs() // added by sim
    });

    var html =
      '<!doctype html>\n' +
      '<html>\n' +
      '<head>\n' +
      '  <meta charset="utf-8"/>\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1"/>\n' +
      '  <title>Receive Service Items</title>\n' +
      '  <style>\n' +
      '    body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f6f7f9;color:#111;}\n' +
      '    .wrap{padding:14px;}\n' +
      '    .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,.05);}\n' +
      '    .topbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}\n' +
      '    .titlebox{flex:1;text-align:center;}\n' +
      '    .title{font-size:24px;font-weight:700;}\n' +
      '    .hint{font-size:12px;color:#6b7280;margin-top:6px;}\n' +
      '    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;}\n' +
      '    label{font-size:12px;color:#374151;display:block;margin-bottom:4px;}\n' +
      '    select,input[type="date"]{height:34px;border:1px solid #d1d5db;border-radius:8px;padding:0 10px;background:#fff;}\n' +
      '    .btn{height:34px;border:0;border-radius:8px;padding:0 12px;cursor:pointer;}\n' +
      '    .btn-primary{background:#2563eb;color:#fff;}\n' +
      '    .btn-ghost{background:#eef2ff;color:#1e40af;}\n' +
      '    .btn-danger{background:#fee2e2;color:#991b1b;}\n' +
      '    table{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;}\n' +
      '    thead th{position:sticky;top:0;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:left;padding:8px;z-index:1;}\n' +
      '    th[data-sort]{cursor:pointer;user-select:none;white-space:nowrap;}\n' + // Sortable headers. Change by Sim 23-Jun
      '    th[data-sort]:hover{text-decoration:underline;background:#eef2ff;}\n' + // Highlight sortable header on hover. Change by Sim 23-Jun
      '    th[data-sort] .sort-ind{font-size:10px;color:#6b7280;margin-left:4px;}\n' + // Sort direction indicator. Change by Sim 23-Jun
      '    tbody td{border-bottom:1px solid #f0f2f5;font-size:12px;padding:8px;vertical-align:top;}\n' +
      '    tbody tr:hover{background:#fafafa;}\n' +
      '    .chk{transform:scale(1.1);}\n' +
      '    .mini{font-size:11px;color:#6b7280;}\n' +
      '    .pill{display:inline-flex;align-items:center;gap:8px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:999px;padding:4px 10px;}\n' +
      '    .pill b{font-weight:600;color:#111;}\n' +
      '    .x{cursor:pointer;color:#b91c1c;font-weight:700;}\n' +
      '    .filebox input[type=file]{font-size:12px;}\n' +
      '    .cell-input{height:28px;border:1px solid #d1d5db;border-radius:8px;padding:0 8px;width:110px;}\n' +
      '    .cell-select{height:28px;border:1px solid #d1d5db;border-radius:8px;padding:0 6px;width:190px;background:#fff;}\n' +
      '    #overlay{display:none;position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:9999;}\n' +
      '    #overlay .box{position:absolute;left:50%;top:35%;transform:translate(-50%,-50%);width:420px;max-width:90%;background:#fff;border-radius:14px;padding:16px;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,.25);} \n' +
      '    #overlay .msg{font-weight:700;margin-bottom:10px;text-align:center;}\n' +
      '    #overlay .bar{height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;}\n' +
      '    #overlay .bar > div{height:100%;width:35%;background:#2563eb;border-radius:999px;animation:move 1.1s infinite ease-in-out;}\n' +
      '    @keyframes move{0%{transform:translateX(-120%);}100%{transform:translateX(320%);}}\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <div id="overlay"><div class="box"><div class="msg">Receiving... Please wait</div><div class="bar"><div></div></div><div class="hint" style="text-align:center;margin-top:10px;">Uploading files and creating Item Receipts</div></div></div>\n' +
      '\n' +
      '  <div class="wrap">\n' +
      '    <div class="card">\n' +
      '      <div class="topbar">\n' +
      '        <div style="width:120px;"></div>\n' +
      '        <div class="titlebox">\n' +
      '          <div class="title">' + (userCanSeeAllPOs() ? 'Receive Service Items' : 'My Receive Service Items') + '</div>\n' + //udpated by sim
      '        </div>\n' +
      '        <div style="width:120px;display:flex;justify-content:flex-end;">\n' +
      '          <button class="btn btn-primary" id="btnReceive">Receive Selected</button>\n' +
      '        </div>\n' +
      '      </div>\n' +
      '\n' +
      '      <div class="row" id="filterRow">\n' + // added by sim (id for the div)
      '        <div>\n' +
      '          <label>Subsidiary</label>\n' +
      '          <select id="fSubs" style="min-width:220px;"></select>\n' +
      '        </div>\n' +
      '        <div>\n' +
      '          <label>PO Date From</label>\n' +
      '          <input type="date" id="fFrom"/>\n' +
      '        </div>\n' +
      '        <div>\n' +
      '          <label>PO Date To</label>\n' +
      '          <input type="date" id="fTo"/>\n' +
      '        </div>\n' +
      '        <div>\n' +
      '          <label>Received By</label>\n' +
      '          <select id="fReceivedBy" style="min-width:180px;"></select>\n' +
      '        </div>\n' +
      '        <div>\n' +
      '          <label>Location</label>\n' +
      '          <select id="fLocation" style="min-width:190px;"></select>\n' +
      '        </div>\n' +
      '        <div>\n' +
      '          <label>Vendor</label>\n' +
      '          <select id="fVendor" style="min-width:220px;"></select>\n' +
      '        </div>\n' +
      '        <div>\n' +
      '          <label>PO Number (Multi)</label>\n' +
      '          <select id="fPO" multiple size="8" style="min-width:250px;height:90px;border-radius:10px;padding:8px;"></select>\n' + // Make PO multi-select taller. Change by Sim 23-Jun
      '        </div>\n' +
      '        <div>\n' +
      '          <button class="btn btn-ghost" id="btnApply">Apply Filter</button>\n' +
      '          <button class="btn btn-danger" id="btnClear">Clear</button>\n' +
      '        </div>\n' +
      '      </div>\n' +
      '\n' +
      '      <div style="margin-top:10px;" id="stats" class="mini"></div>\n' +
      '\n' +
      '      <form id="mainForm" method="post" enctype="multipart/form-data">\n' +
      '        <input type="hidden" name="' + ACTION_FLID + '" id="action" value=""/>\n' +
      '        <input type="hidden" name="' + PAYLOAD_FLID + '" id="payload" value=""/>\n' +
      '        <input type="hidden" name="' + FILTER_FLID + '" id="filters" value=""/>\n' +
      '\n' +
      '        <div style="overflow:auto;border:1px solid #e5e7eb;border-radius:10px;margin-top:10px;">\n' +
      '          <table>\n' +
      '            <thead>\n' +
      '              <tr>\n' +
      '                <th><input type="checkbox" id="chkAll"/></th>\n' +
      '                <th>Date Received</th>\n' +
      '                <th>File Upload</th>\n' +
      '                <th data-sort="tranId" data-sort-type="text">PO # <span class="sort-ind"></span></th>\n' + // Sort PO Number. Change by Sim 23-Jun
      '                <th data-sort="received_byText" data-sort-type="text">Received By <span class="sort-ind"></span></th>\n' + // Sort Received By. Change by Sim 23-Jun
      '                <th data-sort="tranDate" data-sort-type="date">PO Date <span class="sort-ind"></span></th>\n' + // Sort PO Date. Change by Sim 23-Jun
      '                <th data-sort="reqDate" data-sort-type="date">Expected Receipt Date<<span class="sort-ind"></span></th>\n' + // Sort Requested Date. Change by Sim 23-Jun
      '                <th data-sort="vendorName" data-sort-type="text">Vendor <span class="sort-ind"></span></th>\n' + // Sort Vendor. Change by Sim 23-Jun
      '                <th data-sort="subsidiaryText" data-sort-type="text">Subsidiary <span class="sort-ind"></span></th>\n' + // Sort Subsidiary. Change by Sim 23-Jun
      '                <th data-sort="itemText" data-sort-type="text">Service Item <span class="sort-ind"></span></th>\n' + // Sort Service Item. Change by Sim 23-Jun
      '                <th data-sort="memo" data-sort-type="text">Memo <span class="sort-ind"></span></th>\n' + // Sort Memo. Change by Sim 23-Jun
      '                <th data-sort="qty" data-sort-type="number">Qty (PO) <span class="sort-ind"></span></th>\n' + // Sort Memo. Change by Sim 23-Jun
      '                <th data-sort="qtyRecv" data-sort-type="number">Qty Received <span class="sort-ind"></span></th>\n' + // Sort Memo. Change by Sim 23-Jun
      '                <th data-sort="qtyBilled" data-sort-type="number">Qty Billed <span class="sort-ind"></span></th>\n' + // Add sortable Qty Billed. Change by Sim 26-Jun
      '                <th data-sort="location" data-sort-type="location">Location <span class="sort-ind"></span></th>\n' + // Sort Memo. Change by Sim 23-Jun
      '                <th>Qty To Receive</th>\n' +
      '              </tr>\n' +
      '            </thead>\n' +
      '            <tbody id="tbody"></tbody>\n' +
      '          </table>\n' +
      '        </div>\n' +
      '      </form>\n' +
      '\n' +
      '    </div>\n' +
      '  </div>\n' +
      '\n' +
      '<script>\n' +
      '  var DATA = ' + dataJson + ';\n' +
      '  var CURRENT_ROWS = DATA.rows || []; // Active rows after filter/sort. Change by Sim 23-Jun\n' +
      '  var SORT_FIELD = ""; // Current sort field. Change by Sim 23-Jun\n' +
      '  var SORT_DIR = "asc"; // Current sort direction. Change by Sim 23-Jun\n' +
      '\n' +
      '  function esc(s){\n' +
      '    s = (s===null||s===undefined) ? "" : String(s);\n' +
      '    return s.replace(/[&<>\\"\\\']/g,function(c){\n' +
      '      return ({ "&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\\\'":"&#39;" })[c];\n' +
      '    });\n' +
      '  }\n' +
      '\n' +
      '  function isoFromNsDate(str){\n' +
      '    if (!str) return "";\n' +
      '    str = String(str);\n' +
      '    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return str;\n' +
      '    var m = str.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);\n' +
      '    if (m){\n' +
      '      var mm = ("0"+m[1]).slice(-2);\n' +
      '      var dd = ("0"+m[2]).slice(-2);\n' +
      '      return m[3] + "-" + mm + "-" + dd;\n' +
      '    }\n' +
      '    return "";\n' +
      '  }\n' +
      '\n' +
      '  function buildSubsToLocMap(){\n' +
      '    var map = {};\n' +
      '    var locs = DATA.locations || [];\n' +
      '    for (var i=0;i<locs.length;i++){\n' +
      '      var l = locs[i];\n' +
      '      var subs = l.subs || [];\n' +
      '      for (var s=0;s<subs.length;s++){\n' +
      '        var sid = String(subs[s]||"").trim();\n' +
      '        if (!sid) continue;\n' +
      '        if (!map[sid]) map[sid] = [];\n' +
      '        map[sid].push(l);\n' +
      '      }\n' +
      '    }\n' +
      '    console.log("map", map);\n' +
      '    return map;\n' +
      '  }\n' +
      '\n' +
      '  var SUB_TO_LOC = buildSubsToLocMap();\n' +
      '\n' +
      '  function buildSubsidiaryOptions(){\n' +
      '    var sel = document.getElementById("fSubs");\n' +
      '    sel.innerHTML = "";\n' +
      '    sel.appendChild(new Option("", ""));\n' +
      '    var map = {};\n' +
      '    (DATA.rows||[]).forEach(function(r){ if (r.subsidiaryText) map[r.subsidiaryText]=true; });\n' +
      '    Object.keys(map).sort().forEach(function(txt){ sel.appendChild(new Option(txt, txt)); });\n' +
      '  }\n' +
      '\n' +
      '  function buildPoOptions(){\n' +
      '    var sel = document.getElementById("fPO");\n' +
      '    sel.innerHTML = "";\n' +
      '    (DATA.poOptions||[]).forEach(function(p){ sel.appendChild(new Option(p.tranid, String(p.id))); });\n' +
      '  }\n' +
      '  // Build toolbar dropdown filters from loaded rows. Change by Sim 23-Jun\n' +
      '  function buildSimpleDropdownFromRows(selectId, valueGetter, textGetter){\n' +
      '    var sel = document.getElementById(selectId);\n' +
      '    if (!sel) return;\n' +
      '    sel.innerHTML = "";\n' +
      '    sel.appendChild(new Option("", ""));\n' +
      '\n' +
      '    var map = {};\n' +
      '    (DATA.rows || []).forEach(function(r){\n' +
      '      var val = String(valueGetter(r) || "").trim();\n' +
      '      var txt = String(textGetter(r) || val).trim();\n' +
      '      if (!val || !txt) return;\n' +
      '      if (!map[val]) map[val] = txt;\n' +
      '    });\n' +
      '\n' +
      '    Object.keys(map).sort(function(a,b){\n' +
      '      return String(map[a]).localeCompare(String(map[b]));\n' +
      '    }).forEach(function(val){\n' +
      '      sel.appendChild(new Option(map[val], val));\n' +
      '    });\n' +
      '  }\n' +
      '\n' +
      '  // Build Received By filter with -NONE- option for blank values. Change by Sim 23-Jun\n' +
      '  function buildReceivedByFilter(){\n' +
      '    var sel = document.getElementById("fReceivedBy");\n' +
      '    if (!sel) return;\n' +
      '    sel.innerHTML = "";\n' +
      '    sel.appendChild(new Option("", ""));\n' +
      '\n' +
      '    var map = {};\n' +
      '    var hasNone = false;\n' +
      '\n' +
      '    (DATA.rows || []).forEach(function(r){\n' +
      '      var val = String(r.received_by || "").trim();\n' +
      '      var txt = String(r.received_byText || "").trim();\n' +
      '\n' +
      '      if (!val){\n' +
      '        hasNone = true;\n' +
      '        return;\n' +
      '      }\n' +
      '\n' +
      '      if (!txt) txt = val;\n' +
      '      if (!map[val]) map[val] = txt;\n' +
      '    });\n' +
      '\n' +
      '    if (hasNone) sel.appendChild(new Option("-NONE-", "__NONE__"));\n' +
      '\n' +
      '    Object.keys(map).sort(function(a,b){\n' +
      '      return String(map[a]).localeCompare(String(map[b]));\n' +
      '    }).forEach(function(val){\n' +
      '      sel.appendChild(new Option(map[val], val));\n' +
      '    });\n' +
      '  }\n' +
      '  // Build Received By, Location, and Vendor filters. Change by Sim 23-Jun\n' +
      '  function buildExtraFilters(){\n' +
      '    buildReceivedByFilter(); // Add -NONE- option for blank Received By. Change by Sim 23-Jun\n' +
      '    buildSimpleDropdownFromRows("fLocation", function(r){ return r.location; }, function(r){ return getLocationNameById(r.location); });\n' +
      '    buildSimpleDropdownFromRows("fVendor", function(r){ return r.vendorName; }, function(r){ return r.vendorName; });\n' +
      '  }\n' +
      '\n' +
      '  // Get location display name from loaded location list. Change by Sim 23-Jun\n' +
      '  function getLocationNameById(locId){\n' +
      '    locId = String(locId || "").trim();\n' +
      '    if (!locId) return "";\n' +
      '    var locs = DATA.locations || [];\n' +
      '    for (var i = 0; i < locs.length; i++){\n' +
      '      if (String(locs[i].id) === locId) return String(locs[i].name || "");\n' +
      '    }\n' +
      '    return locId;\n' +
      '  }\n' +
      '\n' +
      '  // Check if user has entered data that may be lost on table refresh. Change by Sim 23-Jun\n' +
      '  function hasUserEnteredData(){\n' +
      '    var tb = document.getElementById("tbody");\n' +
      '    if (!tb) return false;\n' +
      '\n' +
      '    var checks = tb.querySelectorAll(".chk");\n' +
      '    for (var i = 0; i < checks.length; i++){\n' +
      '      if (checks[i].checked) return true;\n' +
      '    }\n' +
      '\n' +
      '    var dates = tb.querySelectorAll("[data-recdate]");\n' +
      '    for (var d = 0; d < dates.length; d++){\n' +
      '      if (String(dates[d].value || "").trim()) return true;\n' +
      '    }\n' +
      '\n' +
      '    var qtys = tb.querySelectorAll("[data-qty]");\n' +
      '    for (var q = 0; q < qtys.length; q++){\n' +
      '      if (String(qtys[q].value || "").trim()) return true;\n' +
      '    }\n' +
      '\n' +
      '    var locs = tb.querySelectorAll("[data-loc]");\n' +
      '    for (var l = 0; l < locs.length; l++){\n' +
      '      var curr = String(locs[l].value || "").trim();\n' +
      '      var orig = String(locs[l].getAttribute("data-originalloc") || "").trim();\n' +
      '      if (curr !== orig) return true;\n' +
      '    }\n' +
      '\n' +
      '    var files = tb.querySelectorAll("[data-fileinput]");\n' +
      '    for (var f = 0; f < files.length; f++){\n' +
      '      if (files[f].files && files[f].files.length) return true;\n' +
      '    }\n' +
      '\n' +
      '    return false;\n' +
      '  }\n' +
      '\n' +
      '  // Return value used for sorting. Change by Sim 23-Jun\n' +
      '  function getSortValue(row, field, type){\n' +
      '    if (type === "number") return Number(row[field] || 0);\n' +
      '    if (type === "date") return isoFromNsDate(row[field]) || "";\n' +
      '    if (type === "location") return getLocationNameById(row.location || "").toLowerCase();\n' +
      '    return String(row[field] || "").toLowerCase();\n' +
      '  }\n' +
      '\n' +
      '  // Update arrow indicator on active sorted column. Change by Sim 23-Jun\n' +
      '  function updateSortIndicators(){\n' +
      '    var heads = document.querySelectorAll("th[data-sort]");\n' +
      '    for (var i = 0; i < heads.length; i++){\n' +
      '      var h = heads[i];\n' +
      '      var ind = h.querySelector(".sort-ind");\n' +
      '      if (!ind) continue;\n' +
      '      ind.textContent = h.getAttribute("data-sort") === SORT_FIELD ? (SORT_DIR === "asc" ? "▲" : "▼") : "↕"; // Show sortable columns. Change by Sim 23-Jun \n' +
      '    }\n' +
      '  }\n' +
      '\n' +
      '  // Sort current filtered rows and re-render table. Change by Sim 23-Jun\n' +
      '  function sortRows(field, type){\n' +
      '    if (hasUserEnteredData()){\n' +
      '      var ok = confirm("Sorting will refresh the table and your selected rows, entered dates, quantities, locations, or file uploads may be lost. Do you want to continue?");\n' +
      '      if (!ok) return;\n' +
      '    }\n' +
      '\n' +
      '    if (SORT_FIELD === field){\n' +
      '      SORT_DIR = SORT_DIR === "asc" ? "desc" : "asc";\n' +
      '    } else {\n' +
      '      SORT_FIELD = field;\n' +
      '      SORT_DIR = "asc";\n' +
      '    }\n' +
      '\n' +
      '    CURRENT_ROWS = (CURRENT_ROWS || []).slice().sort(function(a, b){\n' +
      '      var av = getSortValue(a, field, type);\n' +
      '      var bv = getSortValue(b, field, type);\n' +
      '\n' +
      '      if (type === "number"){\n' +
      '        return SORT_DIR === "asc" ? av - bv : bv - av;\n' +
      '      }\n' +
      '\n' +
      '      if (av < bv) return SORT_DIR === "asc" ? -1 : 1;\n' +
      '      if (av > bv) return SORT_DIR === "asc" ? 1 : -1;\n' +
      '      return 0;\n' +
      '    });\n' +
      '\n' +
      '    renderTable(CURRENT_ROWS);\n' +
      '    updateSortIndicators();\n' +
      '  }\n' +
      '\n' +
      '  // Add click events to sortable headers. Change by Sim 23-Jun\n' +
      '  function initSorting(){\n' +
      '    var heads = document.querySelectorAll("th[data-sort]");\n' +
      '    for (var i = 0; i < heads.length; i++){\n' +
      '      heads[i].addEventListener("click", function(){\n' +
      '        sortRows(this.getAttribute("data-sort"), this.getAttribute("data-sort-type") || "text");\n' +
      '      });\n' +
      '    }\n' +
      '  }\n' +
      '\n' +
      '  function getSelectedMulti(sel){\n' +
      '    var out=[];\n' +
      '    for (var i=0;i<sel.options.length;i++) if (sel.options[i].selected) out.push(sel.options[i].value);\n' +
      '    return out;\n' +
      '  }\n' +
      '\n' +
      '  function applyFilter(){\n' +
      '    var subsTxt = document.getElementById("fSubs").value || "";\n' +
      '    var fromIso = document.getElementById("fFrom").value || "";\n' +
      '    var toIso   = document.getElementById("fTo").value || "";\n' +
      '    var recBy   = document.getElementById("fReceivedBy").value || "";\n' +
      '    var locId   = document.getElementById("fLocation").value || "";\n' +
      '    var vendor  = document.getElementById("fVendor").value || "";\n' +
      '    var poIds   = getSelectedMulti(document.getElementById("fPO"));\n' +
      '\n' +
      '    var out = (DATA.rows||[]).filter(function(r){\n' +
      '      if (subsTxt && String(r.subsidiaryText||"") !== subsTxt) return false;\n' +
      '      if (recBy === "__NONE__" && String(r.received_by || "").trim()) return false;\n' + // Filter blank Received By. Change by Sim 23-Jun
      '      if (recBy && recBy !== "__NONE__" && String(r.received_by || "") !== recBy) return false;\n' + // Filter selected Received By. Change by Sim 23-Jun
      '      if (locId && String(r.location || "") !== locId) return false;\n' +
      '      if (vendor && String(r.vendorName || "") !== vendor) return false;\n' +
      '      if (poIds && poIds.length && poIds.indexOf(String(r.poId)) === -1) return false;\n' +
      '      var dIso = isoFromNsDate(r.tranDate);\n' +
      '      if (fromIso && dIso && dIso < fromIso) return false;\n' +
      '      if (toIso   && dIso && dIso > toIso) return false;\n' +
      '      return true;\n' +
      '    });\n' +
      '    CURRENT_ROWS = out; // Keep filtered rows available for sorting. Change by Sim 23-Jun\n' +
      '    renderTable(CURRENT_ROWS);\n' +
      '    updateSortIndicators();\n' +
      // '    document.getElementById("filters").value = JSON.stringify({ subsidiaryText: subsTxt, datefrom: fromIso, dateto: toIso, poPickIds: poIds });\n' +
      '    document.getElementById("filters").value = JSON.stringify({ subsidiaryText: subsTxt, datefrom: fromIso, dateto: toIso, receivedBy: recBy, location: locId, vendor: vendor, poPickIds: poIds });\n' +
      '  }\n' +
      '\n' +
      '  function clearFilter(){\n' +
      '    document.getElementById("fSubs").value="";\n' +
      '    document.getElementById("fFrom").value="";\n' +
      '    document.getElementById("fTo").value="";\n' +
      '    document.getElementById("fReceivedBy").value="";\n' +
      '    document.getElementById("fLocation").value="";\n' +
      '    document.getElementById("fVendor").value="";\n' +
      '    var poSel = document.getElementById("fPO");\n' +
      '    for (var i=0;i<poSel.options.length;i++) poSel.options[i].selected=false;\n' +
      '    CURRENT_ROWS = DATA.rows || []; // Reset rows after clear. Change by Sim 23-Jun\n' +
      '    SORT_FIELD = "";\n' +
      '    SORT_DIR = "asc";\n' +
      '    renderTable(CURRENT_ROWS);\n' +
      '    updateSortIndicators();\n' +
      '    document.getElementById("filters").value = "";\n' +
      '  }\n' +
      '\n' +
      '  function buildLocSelect(rowSubsId, currentId){\n' +
      '    rowSubsId = String(rowSubsId||"").trim();\n' +
      '    currentId = String(currentId||"").trim();\n' +
      '\n' +
      '    var list = SUB_TO_LOC[rowSubsId] || [];\n' +
      '    var html = "<select class=\\"cell-select\\" data-loc data-originalloc=\\"" + esc(currentId) + "\\">";\n' + // Track original location for sort warning. Change by Sim 23-Jun
      '    html += "<option value=\\"\\"></option>";\n' +
      '    for (var i=0;i<list.length;i++){\n' +
      '      var l = list[i];\n' +
      '      var sel = (String(l.id)===currentId) ? " selected" : "";\n' +
      '      html += "<option value=\\"" + esc(l.id) + "\\"" + sel + ">" + esc(l.name) + "</option>";\n' +
      '    }\n' +
      '    html += "</select>";\n' +
      '    return html;\n' +
      '  }\n' +
      '\n' +
      '  function renderTable(rows){\n' +
      '    var tb = document.getElementById("tbody");\n' +
      '    tb.innerHTML = "";\n' +
      '    var frag = document.createDocumentFragment();\n' +
      '\n' +
      '    for (var i=0;i<(rows||[]).length;i++){\n' +
      '      var r = rows[i];\n' +
      '      var tr = document.createElement("tr");\n' +
      '\n' +
      '      var fileFieldName = "file__" + String(r.poId) + "__" + String(r.lineUk);\n' +
      '\n' +
      '      tr.innerHTML =\n' +
      '        "<td><input class=\\"chk\\" type=\\"checkbox\\" data-po=\\"" + esc(r.poId) + "\\" data-lineuk=\\"" + esc(r.lineUk) + "\\" data-lineno=\\"" + esc(r.lineDisplay) + "\\"/></td>" +\n' +
      '        "<td><input class=\\"cell-input\\" type=\\"date\\" data-recdate value=\\"\\\"/></td>" +\n' +
      '        "<td class=\\"filebox\\">" +\n' +
      '          "<input type=\\"file\\" name=\\"" + esc(fileFieldName) + "\\" data-fileinput />" +\n' +
      '          "<div class=\\"mini\\" style=\\"margin-top:6px;\\">" +\n' +
      '            "<span class=\\"pill\\" style=\\"display:none;\\"><b data-fname></b><span class=\\"x\\" data-fclear>×</span></span>" +\n' +
      '          "</div>" +\n' +
      '        "</td>" +\n' +
      '        "<td>" + esc(r.tranId) + "</td>" +\n' +
      '        "<td>" + esc(r.received_byText) + "</td>" +\n' + //added by sim
      '        "<td>" + esc(r.tranDate) + "</td>" +\n' +
      '        "<td>" + esc(r.reqDate||"") + "</td>" +\n' +
      '        "<td>" + esc(r.vendorName||"") + "</td>" +\n' +
      '        "<td>" + esc(r.subsidiaryText||"") + "</td>" +\n' +
      '        "<td>" + esc(r.itemText||"") + "</td>" +\n' +
      '        "<td>" + esc(r.memo||"") + "</td>" +\n' +
      '        "<td>" + esc(r.qty) + "</td>" +\n' +
      '        "<td>" + esc(r.qtyRecv) + "</td>" +\n' +
      '        "<td>" + esc(r.qtyBilled || 0) +"</td>" +\n' +
      '        "<td>" + buildLocSelect(r.subsidiaryText, r.location) + "</td>" +\n' +
      '        "<td><input class=\\"cell-input\\" type=\\"number\\" min=\\"0\\" step=\\"1\\" data-qty value=\\"\\"/></td>";\n' + // Keep Qty To Receive blank. Change by Sim 23-Jun
      '\n' +
      '      frag.appendChild(tr);\n' +
      '    }\n' +
      '\n' +
      '    tb.appendChild(frag);\n' +
      '\n' +
      '    var inputs = tb.querySelectorAll("[data-fileinput]");\n' +
      '    for (var k=0;k<inputs.length;k++){\n' +
      '      (function(inp){\n' +
      '        var pill = inp.parentNode.querySelector(".pill");\n' +
      '        var fnameEl = inp.parentNode.querySelector("[data-fname]");\n' +
      '        var clearEl = inp.parentNode.querySelector("[data-fclear]");\n' +
      '        inp.addEventListener("change", function(){\n' +
      '          if (inp.files && inp.files.length){\n' +
      '            fnameEl.textContent = inp.files[0].name;\n' +
      '            pill.style.display = "inline-flex";\n' +
      '          } else {\n' +
      '            fnameEl.textContent = "";\n' +
      '            pill.style.display = "none";\n' +
      '          }\n' +
      '        });\n' +
      '        clearEl.addEventListener("click", function(){\n' +
      '          inp.value = "";\n' +
      '          fnameEl.textContent = "";\n' +
      '          pill.style.display = "none";\n' +
      '        });\n' +
      '      })(inputs[k]);\n' +
      '    }\n' +
      '\n' +
      '    document.getElementById("stats").textContent = "Rows: " + (rows||[]).length;\n' +
      '  }\n' +
      '\n' +
      '  function collectPayload(){\n' +
      '    var tb = document.getElementById("tbody");\n' +
      '    var checks = tb.querySelectorAll(".chk");\n' +
      '    var out = [];\n' +
      '    for (var i=0;i<checks.length;i++){\n' +
      '      var c = checks[i];\n' +
      '      if (!c.checked) continue;\n' +
      '\n' +
      '      var tr = c.closest("tr");\n' +
      '      var recDate = tr.querySelector("[data-recdate]").value || "";\n' +
      '      var qtyVal  = tr.querySelector("[data-qty]").value || "";\n' +
      '      var locEl   = tr.querySelector("[data-loc]");\n' +
      '      var locVal  = locEl ? (locEl.value || "") : "";\n' +
      '\n' +
      '      out.push({\n' +
      '        poId:   Number(c.getAttribute("data-po")||0),\n' +
      '        lineUk: Number(c.getAttribute("data-lineuk")||0),\n' +
      '        lineNo: Number(c.getAttribute("data-lineno")||0),\n' +
      '        qty:    Number(qtyVal||0),\n' +
      '        locId:  Number(locVal||0),\n' +
      '        recDate: recDate\n' +
      '      });\n' +
      '    }\n' +
      '    return out;\n' +
      '  }\n' +
      '\n' +
      '  function showOverlay(){ document.getElementById("overlay").style.display = "block"; }\n' +
      '\n' +
      '  document.getElementById("btnApply").addEventListener("click", function(e){ e.preventDefault(); applyFilter(); });\n' +
      '  document.getElementById("btnClear").addEventListener("click", function(e){ e.preventDefault(); clearFilter(); });\n' +
      '\n' +
      '  document.getElementById("chkAll").addEventListener("change", function(){\n' +
      '    var on = this.checked;\n' +
      '    var tb = document.getElementById("tbody");\n' +
      '    var checks = tb.querySelectorAll(".chk");\n' +
      '    for (var i=0;i<checks.length;i++) checks[i].checked = on;\n' +
      '  });\n' +
      '\n' +
      '  document.getElementById("btnReceive").addEventListener("click", function(e){\n' +
      '    e.preventDefault();\n' +
      '    var payload = collectPayload();\n' +
      '    if (!payload.length){ alert("Select at least one row."); return; }\n' +
      '\n' +
      '    for (var i=0;i<payload.length;i++){\n' +
      '      if (!payload[i].qty || payload[i].qty <= 0){ alert("Enter Qty To Receive for all selected rows."); return; }\n' +
      '      if (!payload[i].locId){ alert("Select Location for all selected rows."); return; }\n' +
      '      if (!payload[i].recDate){ alert("Enter Date Received for all selected rows."); return; }\n' +
      '    }\n' +
      '\n' +
      '    document.getElementById("action").value = "' + ACTION_RECEIVE + '";\n' +
      '    document.getElementById("payload").value = JSON.stringify(payload);\n' +
      '    showOverlay();\n' +
      '    document.getElementById("mainForm").submit();\n' +
      '  });\n' +
      '\n' +
      // '  if (!DATA.canSeeAllPOs) {\n' + //added by sim 5 lines from here till build.. ()
      // '    var filterRow = document.getElementById("filterRow");\n' +
      // '    if (filterRow) filterRow.style.display = "none";\n' +
      // '  }\n' +
      '  // Hide only full-access filters for restricted receiver users. Change by Sim 23-Jun\n' +
      '  if (!DATA.canSeeAllPOs) {\n' +
      '    var fSubsWrap = document.getElementById("fSubs") ? document.getElementById("fSubs").closest("div") : null;\n' +
      '    var fReceivedByWrap = document.getElementById("fReceivedBy") ? document.getElementById("fReceivedBy").closest("div") : null;\n' +
      '\n' +
      '    if (fSubsWrap) fSubsWrap.style.display = "none";\n' +
      '    if (fReceivedByWrap) fReceivedByWrap.style.display = "none";\n' +
      '  }\n' +
      '\n' +
      '  buildSubsidiaryOptions();\n' +
      '  buildPoOptions();\n' +
      '  buildExtraFilters(); // Add Received By, Location, Vendor filters. Change by Sim 23-Jun\n' +
      '  initSorting(); // Enable sortable headers. Change by Sim 23-Jun\n' +
      '  CURRENT_ROWS = DATA.rows || []; // Initialize active rows. Change by Sim 23-Jun\n' +
      '  renderTable(CURRENT_ROWS);\n' +
      '  updateSortIndicators();\n' +
      '</script>\n' +
      '</body>\n' +
      '</html>\n';

    ctx.response.write(html);
  }

  function listLocationsAllPaged() {
    var out = [];

    var locSearch = search.create({
      type: "location",
      filters: [
        ["makeinventoryavailable", "is", "T"],
        "AND",
        ["isinactive", "is", "F"]
      ],
      columns: [
        search.createColumn({ name: "internalid" }),
        search.createColumn({ name: "name" }),
        search.createColumn({ name: "subsidiary" })
      ]
    });

    var paged = locSearch.runPaged({ pageSize: 1000 });
    paged.pageRanges.forEach(function (pr) {
      var page = paged.fetch({ index: pr.index });
      page.data.forEach(function (r) {
        var subs = r.getValue({ name: "subsidiary" });

        var subsArr = [];
        if (Array.isArray(subs)) {
          subsArr = subs;
        } else if (subs) {
          subsArr = String(subs).split(/\u0005|,|\|/);
        }

        var cleanSubs = [];
        for (var i = 0; i < subsArr.length; i++) {
          var v = String(subsArr[i] || '').trim();
          if (v) cleanSubs.push(v);
        }

        out.push({
          id: String(r.getValue({ name: "internalid" }) || ''),
          name: String(r.getValue({ name: "name" }) || ''),
          subs: cleanSubs
        });
      });
    });

    log.debug('Locations loaded', out.length);
    return out;
  }

  function cleanIds(list) {
    if (!list || !list.length) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var v = String(list[i] || '').trim();
      if (v && /^\d+$/.test(v)) out.push(v);
    }
    return out;
  }

  function readFilters(req) {
    var ids = req.parameters.popickid || req.parameters.poPickIds || [];
    if (ids && !Array.isArray(ids)) ids = String(ids).split(',');

    return {
      poPickIds: cleanIds(ids || []),
      subsidiary: String(req.parameters.subsidiary || '').trim(),
      datefrom: String(req.parameters.datefrom || '').trim(),
      dateto: String(req.parameters.dateto || '').trim()
    };
  }

  //added by sim
  function userCanSeeAllPOs() {
    var user = runtime.getCurrentUser();
    var roleId = Number(user.role || 0);

    return ALLOWED_FULL_ACCESS_ROLES.indexOf(roleId) !== -1;
  }

  function runSearch(args) {
    var s = search.load({ id: SEARCH_ID });

    var hasLuk = (s.columns || []).some(function (c) { return c && c.name === 'lineuniquekey'; });
    if (!hasLuk) s.columns = (s.columns || []).concat([search.createColumn({ name: 'lineuniquekey' })]);

    var add = [];
    var poIds = cleanIds(args.poPickIds);

    if (poIds.length) {
      add.push(search.createFilter({ name: 'internalid', operator: search.Operator.ANYOF, values: poIds }));
    }
    if (args.subsId) add.push(search.createFilter({ name: 'subsidiary', operator: search.Operator.ANYOF, values: args.subsId }));
    if (args.dateFrom) add.push(search.createFilter({ name: 'trandate', operator: search.Operator.ONORAFTER, values: args.dateFrom }));
    if (args.dateTo) add.push(search.createFilter({ name: 'trandate', operator: search.Operator.ONORBEFORE, values: args.dateTo }));

    //added by sim : start
    if (!userCanSeeAllPOs()) {
      var currentUser = runtime.getCurrentUser();

      add.push(search.createFilter({
        name: 'custbody_received_by',
        operator: search.Operator.ANYOF,
        values: currentUser.id
      }));

      log.audit('SL:runSearch:restricted-user', {
        userId: currentUser.id,
        roleId: currentUser.role
      });
    } else {
      var fullAccessUser = runtime.getCurrentUser();

      log.audit('SL:runSearch:full-access-user', {
        userId: fullAccessUser.id,
        roleId: fullAccessUser.role
      });
    }
    //added by sim : end

    if (add.length) s.filters = (s.filters || []).concat(add);

    var out = [];
    s.run().each(function (r) {
      out.push({
        poId: Number(r.getValue({ name: 'internalid' }) || 0),
        tranId: String(r.getValue({ name: 'tranid' }) || ''),
        received_by: String(r.getValue({ name: 'custbody_received_by' }) || ''), //added by Sim
        received_byText: String(r.getText({ name: 'custbody_received_by' }) || ''), //added by sim
        tranDate: String(r.getValue({ name: 'trandate' }) || ''),
        subsidiaryId: String(r.getValue({ name: 'subsidiarynohierarchy' }) || ''),
        subsidiaryText: String(r.getText({ name: 'subsidiarynohierarchy' }) || ''),
        vendorName: String(r.getValue({ name: 'altname', join: 'vendor' }) || ''),
        itemText: String(r.getText({ name: 'item' }) || ''),
        qty: Number(r.getValue({ name: 'quantity' }) || 0),
        qtyRecv: Number(r.getValue({ name: 'quantityshiprecv' }) || 0),
        qtyBilled: Number(r.getValue({ name: 'quantitybilled' }) || 0), // Add Qty Billed. Change by Sim 26-Jun
        lineDisplay: Number(r.getValue({ name: 'line' }) || 0),
        lineUk: Number(r.getValue({ name: 'lineuniquekey' }) || 0),
        deptText: String(r.getText({ name: 'department' }) || ''),
        rate: Number(r.getValue({ name: 'fxrate' }) || 0),
        amount: Number(r.getValue({ name: 'fxamount' }) || 0),
        memo: String(r.getValue({ name: 'memo' }) || ''),
        // reqDate: String(r.getValue({ name: 'custcol_tc_requested_date' }) || ''),
        reqDate: String(r.getValue({ name: 'expectedreceiptdate' }) || ''), // Use Expected Receipt Date. Change by Sim 26-Jun
        location: String(r.getValue({ name: 'targetlocation' }) || '')
      });
      return true;
    });
    return out;
  }

  function buildPoOptionsFromRows(rows) {
    var map = {};
    var out = [];

    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      var poId = String(r.poId || '').trim();
      var tranId = String(r.tranId || '').trim();

      if (!poId || !tranId) continue;

      if (!map[poId]) {
        map[poId] = true;
        out.push({
          id: Number(poId),
          tranid: tranId
        });
      }
    }

    out.sort(function (a, b) {
      if (a.tranid < b.tranid) return -1;
      if (a.tranid > b.tranid) return 1;
      return 0;
    });

    return out;
  }

  function listRecentPOs(args) {
    var filters = [
      ["type", "anyof", "PurchOrd"],
      "AND",
      ["mainline", "is", "F"],
      "AND",
      ["item.type", "anyof", "Service"],
      "AND",
      ["status", "anyof", "PurchOrd:B", "PurchOrd:D", "PurchOrd:E"],
      "AND",
      ["quantityshiprecv", "equalto", "0"],
      "AND",
      ["datecreated", "onorafter", "11/5/2025"]
    ];
    if (args.subsId) { filters.push('AND', ['subsidiary', 'anyof', args.subsId]); }
    if (args.dateFrom) { filters.push('AND', ['trandate', 'onorafter', args.dateFrom]); }
    if (args.dateTo) { filters.push('AND', ['trandate', 'onorbefore', args.dateTo]); }

    var s = search.create({
      type: search.Type.PURCHASE_ORDER,
      filters: filters,
      columns: [
        search.createColumn({ name: 'trandate', summary: "MAX", sort: search.Sort.DESC }),
        search.createColumn({ name: 'internalid', summary: "GROUP" }),
        search.createColumn({ name: 'tranid', summary: "GROUP" })
      ]
    });

    var out = [];
    s.run().each(function (r) {
      out.push({
        id: Number(r.getValue({ name: 'internalid', summary: "GROUP" }) || 0),
        tranid: String(r.getValue({ name: 'tranid', summary: "GROUP" }) || '')
      });
      return out.length < 200;
    });
    return out;
  }

  function createItemReceiptForLines(poId, items) {
    if (!items || !items.length) return null;

    var ir = record.transform({
      fromType: record.Type.PURCHASE_ORDER,
      fromId: poId,
      toType: record.Type.ITEM_RECEIPT,
      isDynamic: true
    });

    var trandate = items[0].date;
    if (trandate) ir.setValue({ fieldId: 'trandate', value: toDateOnly(trandate) });

    var cnt = ir.getLineCount({ sublistId: 'item' });
    for (var i = 0; i < cnt; i++) {
      ir.selectLine({ sublistId: 'item', line: i });
      if (ir.getCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive' })) {
        ir.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: false });
      }
      ir.commitLine({ sublistId: 'item' });
    }

    var wantByUk = {};
    var wantByLn = {};
    (items || []).forEach(function (p) {
      if (p.orderlineUk) wantByUk[String(p.orderlineUk)] = p;
      if (p.lineNo) wantByLn[String(p.lineNo)] = p;
    });

    var touched = 0;
    for (var k = 0; k < cnt; k++) {
      var irOrderUk = Number(ir.getSublistValue({ sublistId: 'item', fieldId: 'orderline', line: k }) || 0);
      var irLineNo = Number(ir.getSublistValue({ sublistId: 'item', fieldId: 'line', line: k }) || 0);

      var pick = wantByUk[String(irOrderUk)] || wantByLn[String(irLineNo)];
      if (!pick) continue;

      ir.selectLine({ sublistId: 'item', line: k });
      ir.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });

      if (pick.qty > 0) ir.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: pick.qty });
      if (pick.location) ir.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: pick.location });

      ir.commitLine({ sublistId: 'item' });
      touched++;

      if (pick.orderlineUk) delete wantByUk[String(pick.orderlineUk)];
      if (pick.lineNo) delete wantByLn[String(pick.lineNo)];
    }

    if (!touched) return null;

    var savedId = ir.save({ enableSourcing: true, ignoreMandatoryFields: false });

    try {
      var fileIds = {};
      for (var f = 0; f < (items || []).length; f++) {
        var fid = Number(items[f].fileId || 0);
        if (fid) fileIds[fid] = true;
      }

      Object.keys(fileIds).forEach(function (fidStr) {
        record.attach({
          record: { type: 'file', id: Number(fidStr) },
          to: { type: record.Type.ITEM_RECEIPT, id: savedId }
        });
      });

      log.audit('IR:files-attached', { irId: savedId, fileIds: Object.keys(fileIds) });
    } catch (e) {
      log.error('IR:file-attach-error', serializeErr(e));
    }

    return savedId;
  }

  function toDateOnly(v) {
    if (!v) return null;
    if (String(v).indexOf('T') !== -1) v = String(v).substring(0, 10);
    var p = String(v).split('-');
    if (p.length === 3) return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return format.parse({ value: v, type: format.Type.DATE });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function serializeErr(e) {
    if (!e) return { message: 'Unknown error' };
    return {
      name: e.name || (e.type && e.type.name) || 'Error',
      message: e.message || String(e),
      stack: e.stack || ''
    };
  }

  return { onRequest: onRequest };
});