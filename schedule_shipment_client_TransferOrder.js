/**
*@NApiVersion 2.x
*@NScriptType ClientScript
*/

var scriptId = 'customscript_tc_ss_screen_transfer_order';
var deploymentId = 'customdeploy1';
define(['N/url', 'N/runtime', 'N/format','N/ui/dialog','N/currentRecord', 'N/https','N/ui/message','N/search'],
function (url, runtime, format,dialog,currentRecord, https,message,search) {
  var record_id;
  const TASK_STATUS_FAILED = [
    'Failed',
    'Canceled'
  ];

  const TASK_STATUS_PENDING = [
    'Pending',
    'Processing',
    'Restart',
    'Retry'
  ];

  function pageInit(context) {
    if (window.onbeforeunload) {
      window.onbeforeunload = function () {
        null;
      };
    }

    const queryString = window.location.search;
    console.log(queryString);
    const urlParams = new URLSearchParams(queryString);
    console.log(urlParams);
    //var adjustmentId = urlParams.get('adjustmentId');
    var taskId = urlParams.get('scriptTaskId');
    console.log(taskId);
    var fileId = urlParams.get('fileId');
    console.log(fileId);
    var error = urlParams.get('error');
    console.log(error);
    var csr = urlParams.get('creation');


    var userObj = urlParams.get('userObj');;
    console.log(userObj);


    if (error == 't') {
      var errMsg = message.create({
        title: 'Error',
        message: 'An unexpected error has occured. Please contact your administrator.',
        type: message.Type.ERROR
      });
      errMsg.show();
    }
    else if (csr == 'F') {
      var fileMsg = message.create({
        title: 'Processing',
        message: 'A task is running to update the  Schedule Shipment. You will be given a confirmation prompt when complete.',
        type: message.Type.INFORMATION
      });
      fileMsg.show();

      var timer = setInterval(function () {
        var scheduledscriptinstanceSearchObj = search.create({
          type: "scheduledscriptinstance",
          filters:
          [
            ["taskid","contains",taskId],
            "AND",
            ["mapreducestage","anyof","SUMMARIZE"]
          ],
          columns:
          [
            search.createColumn({name: "status", label: "Status"})
          ]
        });
        var searchResultCount = scheduledscriptinstanceSearchObj.runPaged().count;
        log.debug("scheduledscriptinstanceSearchObj result count",searchResultCount);
        scheduledscriptinstanceSearchObj.run().each(function(result){

          var main_status = result.getValue({name: "status", label: "Status"})
          if (main_status == 'Complete') {
            var fileMsg01 = message.create({
              title: 'Success',
              message: 'Shipping record is updated.',
              type: message.Type.CONFIRMATION
            });
            fileMsg.hide();
            fileMsg01.show();
            clearInterval(timer);
          }
          return true;
        });
        }, 60);


        // if (isEmpty(fileId)) {

        //}
        // if (!isEmpty(taskId)) {
        //     var taskMsg = message.create({
        //         title: 'Processing',
        //         message: 'A task is running to update shipping record.',
        //         type: message.Type.INFORMATION
        //     });
        //     taskMsg.show();
        //}
      }

      else if (csr == 'T') {

        if (!isEmpty(fileId)) {
          var fileMsg = message.create({
            title: 'Success',
            message: 'A task has been queued to create this the Consolidated Shipping Record at a later time.',
            type: message.Type.CONFIRMATION
          });
          fileMsg.show();
        }
        if (!isEmpty(taskId)) {
          var taskMsg = message.create({
            title: 'Processing',
            message: 'A task is running to create the Consolidated Shipping Record. You will be given a confirmation prompt when complete.',
            type: message.Type.INFORMATION
          });
          taskMsg.show();
          var timer = setInterval(function () {
            var scheduledscriptinstanceSearchObj = search.create({
              type: "scheduledscriptinstance",
              filters:
              [
                ["taskid", "contains", taskId]
              ],
              columns:
              [
                search.createColumn({ name: "status", label: "Status" })
              ]
            });
            var scheduledscriptinstanceSearchResults = getResults(scheduledscriptinstanceSearchObj);
            var status = 'complete';
            if (scheduledscriptinstanceSearchResults.length == 0) {
              status = 'failed';
            }
            scheduledscriptinstanceSearchResults.forEach(function (result) {
              var stageStatus = result.getValue({
                name: 'status'
              });
              log.debug('status', status);
              if (TASK_STATUS_PENDING.indexOf(stageStatus) > -1 && status != 'failed') {
                status = 'pending';
              }
              if (TASK_STATUS_FAILED.indexOf(stageStatus) > -1) {
                status = 'failed';
              }
            });
            if (status == 'complete') {
              taskMsg.hide();
              var url = new URL(window.location.href);
              var urlParams = new URLSearchParams(url.search);
              urlParams.delete('taskId');
              var refreshUrl = window.location.href.split('?')[0] + '?' + urlParams;

              var transactionSearchObj = search.create({
                type: "transaction",
                filters:
                [
                  ["type","anyof","Custom116"],
                  "AND",
                  ["mainline","is","T"],
                  "AND",
                  ["datecreated","on","today"],
                  "AND",
                  ["createdby","anyof",userObj]
                ],
                columns:
                [
                 search.createColumn({
                     name: "internalid",
                     summary: "MAX",
                     label: "Internal ID"
                 })
                ]
              });
              var searchResultCount = transactionSearchObj.runPaged().count;
              log.debug("transactionSearchObj result count",searchResultCount);
              transactionSearchObj.run().each(function(result){
                // .run().each has a limit of 4,000 results

                record_id = result.getValue({name: "internalid", summary: "MAX", label: "Internal ID"});

                return true;
              });
              console.log(record_id);

              var url_link = "https://6518122.app.netsuite.com/app/accounting/transactions/custom.nl?id="+ record_id + "&customtype=116&whence=";
              var confirmMsg = message.create({
                title: 'Success',
                // message: 'The Consolidated Shipping Record is created. Click here to open <a href="' + url_link + '" target="_blank" rel="noopener noreferrer" onClick="javascript:document.location.replace(\'' + refreshUrl + '\')">record</a> .',
                message: 'The Consolidated Shipping Record is created. Click here to open <a href="' + url_link + '" target="_blank" rel="noopener noreferrer" onClick="reloadPage()">record</a> .',
                //   message: window.open(url_link),
                type: message.Type.CONFIRMATION
              });
              confirmMsg.show();

              clearInterval(timer);
            } else if (status == 'failed') {
              taskMsg.hide();
              var errorMsg = message.create({
                title: 'Error',
                message: 'An unexpected error has occured. Please contact your administrator.',
                type: message.Type.ERROR
              });
              errorMsg.show();
              clearInterval(timer);
            }
          }, 60);
        }}
      }

      function fieldChanged(context) {
        var currRecord = context.currentRecord;
        var fieldName = context.fieldId;

        if(fieldName != 'custpage_startdate' && fieldName != 'custpage_shipping_location' && fieldName != 'custpage_custselect' && fieldName != 'custpage_shippingqty' && fieldName != 'custpage_createshippingrec' && fieldName != 'custpage_email_to' && fieldName != 'custpage_email_cc' && fieldName != 'custpage_email_subject' && fieldName != 'custpage_email_body'){

          var itemName = currRecord.getValue({fieldId: 'custpage_itemname'});
          var scheduledDate = currRecord.getValue({fieldId: 'custpage_shipdate'});
          var soNumber = currRecord.getValue({fieldId: 'custpage_sonumber'});
          var locationID = currRecord.getValue({fieldId: 'custpage_location'});
          var supplyReqDate = currRecord.getValue({fieldId: 'custpage_shipreqby'});
          var reschedule = currRecord.getValue({fieldId: 'custpage_reschedule'});
          var shipcity = currRecord.getText({fieldId: 'custpage_shipping_city'});
          var shipcityID = currRecord.getValue({fieldId: 'custpage_shipping_city'});
          var email = currRecord.getValue({fieldId: 'custpage_send_email'});
          var shipdate = currRecord.getText({fieldId: 'custpage_startdate'});
          var shipLoc = currRecord.getValue({fieldId: 'custpage_shipping_location'});
          var csrbox = currRecord.getValue({fieldId: 'custpage_createshippingrec'});
          var subject = currRecord.getValue({fieldId: 'custpage_email_subject'});
          var body = currRecord.getValue({fieldId: 'custpage_email_body'});
          var emailcc = currRecord.getValue({fieldId: 'custpage_email_cc'});
          var emailto = currRecord.getValue({fieldId: 'custpage_email_to'});

          if(!isEmpty(supplyReqDate)){
            supplyReqDate = format.format({value:supplyReqDate,type:format.Type.DATE});
          }
          if(!isEmpty(scheduledDate)){
            scheduledDate = format.format({value:scheduledDate,type:format.Type.DATE});
            reschedule = 'isnotempty'
          }
          var customer = currRecord.getValue({fieldId: 'custpage_customer'});

          var resolveurl = url.resolveScript({
            scriptId: scriptId,
            deploymentId: deploymentId,
            params:{
              itemname: itemName,
              transferordernumber: soNumber,
              locationid: locationID,
              supplyreqdate: supplyReqDate,
              reschedule: reschedule,
              shipDate:scheduledDate,
              shippingcity:shipcity,
              shipcityID:shipcityID,
              email:email,
              shipdate: shipdate,
              shipLoc: shipLoc,
              csrbox: csrbox
            },
            returnExternalUrl: false
          });
          setWindowChanged(window, false);
          window.location = resolveurl;
        }
      }

      function createShipmentRecord(){
        log.debug({title:'test',details:'terdt'})
        var resetVal = confirm('Are you sure you want to create consolidated shipping record?');
        if(resetVal == true){
          //  var resetVal = confirm('Warning: Data entered will be lost. Are you sure to continue? '+deploymentId);

          var resolveurl = url.resolveScript({
            scriptId: scriptId,
            deploymentId: deploymentId,
            params:{buttonTriggered: 'custpage_submit2'},
            returnExternalUrl: false
          });

          setWindowChanged(window, false);
          window.location = resolveurl;
        }
      }

      function redirectToProgressPage(mapReduceTaskId) {
        var redirectUrl = url.resolveScript({
          scriptId: 'customscript3202', // Replace with the script ID of your Suitelet
          deploymentId: 'customdeploy1', // Replace with the deployment ID of your Suitelet
          params: {
            taskId: mapReduceTaskId,
          },
        });

        window.location.href = redirectUrl;
      }

      function onReset(){
        log.debug({title:'test',details:'terdt'})
        var resetVal = confirm('Warning: Data entered will be lost. Are you sure to continue?');
        if(resetVal == true){
          //  var resetVal = confirm('Warning: Data entered will be lost. Are you sure to continue? '+deploymentId);

          var resolveurl = url.resolveScript({
            scriptId: scriptId,
            deploymentId: deploymentId,
            returnExternalUrl: false
          });

          setWindowChanged(window, false);
          window.location = resolveurl;
        }
      }

      return {
        fieldChanged: fieldChanged,
        onReset:onReset,
        createShipmentRecord:createShipmentRecord,
        redirectToProgressPage:redirectToProgressPage,
        pageInit: pageInit
      }
    });





    function isEmpty(value) {
      if (value === null) {
        return true;
      } else if (value === undefined) {
        return true;
      } else if (value === '') {
        return true;
      } else if (value === ' ') {
        return true;
      } else if (value === 'null') {
        return true;
      } else {
        return false;
      }
    }

    function getResults(searchObj) {
      var resultSet = searchObj.run();
      var results = [];
      var index = 0;
      do {
        var result = resultSet.getRange(index, index + 1000);
        results = results.concat(result);
        index += 1000;
      } while (result.length == 1000);
      return results;
    }
    function reloadPage() {

      var suiteletUrl = url.resolveScript({
        scriptId: 'customscript_tc_ss_screen_transfer_order', // Replace with your Suitelet's script ID
        deploymentId: 'customdeploy1',
        returnExternalUrl: false // Replace with your Suitelet's deployment ID
      });

      setWindowChanged(window, false);
      window.location = suiteletUrl;
      // window.location.href = refreshUrl;
    }
