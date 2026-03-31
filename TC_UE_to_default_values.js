/**
* @NApiVersion 2.1
* @NScriptType UserEventScript
*/
define(['N/https', 'N/format', 'N/log', 'N/ui/message', 'N/render', 'N/record', 'N/xml', 'N/file', 'N/runtime', 'N/email', 'N/search'], function(https, format, log, message, render, record, xml, file, runtime, email, search) {
  
  function beforeLoad(context) {
    try {
      
      var newRecord = context.newRecord;      
      var params = context.request.parameters;
      var recordId = params.csrid;
      log.debug("params URL", params);
      log.debug('recordId', recordId)
      var csrId = params.csr || params.csrid;
      var custId = params.custid;

      if (params.csr) {



      newRecord.setValue({
        fieldId: 'custrecord_tc_to',
        value: params.email
      })

        //   if (params.repmail) {
        //   newRecord.setValue({
        //     fieldId: 'custrecord_tc_cc',
        //     value: params.repmail
        //   })
        // }
      var ccEmails = getEmailFromSOs(csrId);

        if (ccEmails) {
          newRecord.setValue({
            fieldId: 'custrecord_tc_cc',
            value: ccEmails
          })
        }
      
      
      var subject = "Trusscore Packing Slip - " + params.doc;
      
      var richTextValue =
      "Your Order is on the way!<br /><br />Great news, a shipment is on the way to you. Please see the attached PDF for details on the items that have shipped. The Carrier will be in contact with your team to book a receiving appointment.<br /><br />" +
      
      "Estimated Arrival Date: <b>" + params.date + "</b><br />" +
      "Shipment Number: <b>" + params.doc + "</b><br /><br />" +
      "Thanks again. We appreciate your business.<br /><br />" +
      "Sincerely,<br /><b>" +
      params.owner +
      "<br />Trusscore Inc.</b>";
      }
      else if (recordId) {
        // Load current customtransaction118 record
      const rec = record.load({
        type: 'customtransaction118',
        id: recordId,
        isDynamic: false
      });

      const tranId = rec.getValue('tranid');
      const reqLoadDate = rec.getText('custbody_tc_req_load_date');
      const loadingTime = rec.getValue('custbody_tc_loading_hrs');
      const shippingLoc = rec.getText('custbody_tc_shipping_loc');
      const loadOwnerName = rec.getText('custbody_tc_load_owner');
      const deliveryDate = rec.getText('custbody_tc_exp_delivery_date');
      const equipType = rec.getText('custbody_tc_req_equi_type');
      const freightCost = rec.getValue('custbody_ts_vendor_freight');
      const customerPO = rec.getText('custbody_tc_other_deliver_information');
      const relatedSOId = rec.getValue('custbody_tc_related_tran'); // Sales Order field
      const relatedSOList = rec.getValue('custbody_tc_related_so');
      const loadOwnerId = rec.getValue('custbody_tc_load_owner'); // Employee
      var recType = 'salesorder';
      if ((rec.getText('custbody_tc_related_tran')).indexOf("Transfer Order") != -1) recType = 'transferorder';

      // Get Sales Order shipping address
      let deliveryAddress = '';
      if (relatedSOId) {
        const soRec = record.load({ type: recType, id: relatedSOId, isDynamic: false });
        deliveryAddress = soRec.getValue('shipaddress') || '';
      }

      // Get Load Owner email
      let loadOwnerEmail = '';
      if (loadOwnerId) {
        const empRec = record.load({ type: 'employee', id: loadOwnerId, isDynamic: false });
        loadOwnerEmail = empRec.getValue('email') || '';
      }

        const carrierId = rec.getValue('custbody_tc_carrier');
        log.debug('carrierId', carrierId)
let carrierEmail = '';

if (carrierId) {
  const vendorRec = record.load({
    type: record.Type.VENDOR,
    id: carrierId,
    isDynamic: false
  });
  carrierEmail = vendorRec.getValue('email') || '';
}

              newRecord.setValue({
        fieldId: 'custrecord_tc_to',
        value: carrierEmail
      })


        const formattedCost = freightCost
  ? format.format({ value: parseFloat(freightCost), type: format.Type.CURRENCY })
  : '';

      const loadAtName = (shippingLoc === 'Palmerston - Main') ? 'Trusscore Inc.' : 'Trusscore Alberta Inc.';
      const loadaddress = (shippingLoc === 'Palmerston - Main') ? '140 Minto Road, Palmerston ON N0G 2P0, Canada' : '5201 64th Avenue S.E., Calgary AB T2C4Z9, Canada';

      var richTextValue = `
        <p>Hello!</p>
        <p>Thank you for agreeing to haul this load. Please see the confirmed details below:</p>
        <b>Load Details:</b>
        <p><b>Pickup:</b></p>
        <ul>
          
          <li><b>Requested Load Date:</b> ${reqLoadDate}</li>
          <li><b>Loading Appt Time:</b> ${loadingTime || ''}</li>
          <li><b>Load at Name:</b> ${loadAtName}</li>
          <li><b>Load at Address:</b> ${loadaddress}</li>
          <li><b>Load at Contact Name:</b> ${loadOwnerName || ''}</li>
        </ul>
        <p><b>Delivery:</b></p>
        <ul>
          
          <li><b>Delivery Date:</b> ${deliveryDate}</li>
          <li><b>Delivery Address:</b> ${deliveryAddress}</li>
        </ul>
        <p><b>Equipment:</b> ${equipType || ''}</p>
        <p><b>Rate:</b> $ ${formattedCost || ''}</p>
        <b>Special Instructions:</b>
        <ul>
          <li>Delivery appointment required.</li>
          <li>BOL Must have Trusscore, Driver and Receiver Signature and Date for payment</li>
          <li>Customer PO: ${customerPO || ''}</li>
          <li>SHIP Record: ${tranId}</li>
          <li>Sales Order #: ${relatedSOList || ''}</li>
        </ul>
        <p>Thanks again, and safe travels!</p>
        <p>Best regards,<br/>${loadOwnerName}<br/>${loadOwnerEmail}</p>
      `;
      log.debug('richTextValue', richTextValue)


      var subject = "Load Confirmation – PO #" + rec.getText('custbody_ds_freight_purchase_order') + " | " + tranId;

        newRecord.setValue({
        fieldId: 'custrecord_tc_load_confirmation_email',
        value: true
      })
      
      }
      else return;

        newRecord.setValue({
        fieldId: 'custrecord_tc_related_csr',
        value: csrId
      })
      newRecord.setValue({
        fieldId: 'custrecord_tc_customer',
        value: custId
      })
      
      newRecord.setValue({
        fieldId: 'custrecord_tc_body',
        value: richTextValue
      })
      newRecord.setValue({
        fieldId: 'custrecord_tc_subject',
        value: subject
      })


      
    } catch (error) {
      log.error("Error retrieving current URL", error);
    }
  }
  
  function afterSubmit(context) {
    log.debug('afterSubmit', 'Entering afterSubmit function');
    
    var newRecord = context.newRecord;
    var recID = newRecord.getValue({ fieldId: 'custrecord_tc_related_csr' });
    var receipts = newRecord.getValue({ fieldId: 'custrecord_tc_customer' });
    var subject = newRecord.getValue({ fieldId: 'custrecord_tc_subject' });
    var body = newRecord.getValue({ fieldId: 'custrecord_tc_body' });
    var cc = newRecord.getValue({ fieldId: 'custrecord_tc_cc' });
    var to = newRecord.getValue({ fieldId: 'custrecord_tc_to' });
    to = to.replace(/\s/g, ""); // Remove spaces
    var to_array = [];
    to_array.push(to);
    // Process CC field if it exists
    if (cc) {
      cc = cc.replace(/\s/g, ""); // Remove spaces
      cc = cc.split(","); // Split by comma
    }
    
    log.debug('recID', recID);
    
    if (recID) {
      try {

        var transactionRecord = record.load({
          type: 'customtransaction118',
          id: recID
        });
        
        // Create PDF
        if (newRecord.getValue('custrecord_tc_load_confirmation_email')) {
          var pdfFileName = "Load Confirmation ";
          var temId = "CUSTTMPL_147_6518122_325";
          var salesorderId = transactionRecord.getValue({fieldId: 'custbody_tc_related_tran'})
        }else{
          var pdfFileName = "Packing Slip ";
          var temId = "CUSTTMPL_131_6518122_SB1_863";
          var salesorderId = transactionRecord.getValue({fieldId: 'custbody_ds_freight_purchase_order'})
        }
        
        var renderer = render.create();
        renderer.setTemplateByScriptId(temId);
        renderer.addRecord('record', transactionRecord);

        
        // Render the PDF
        var pdfFile = renderer.renderAsPdf();
        
        // Set the name for the PDF file
        pdfFile.name = pdfFileName + recID + ".pdf"; // e.g., "Order Confirmation 123.pdf"
        pdfFile.folder = 157113; // Replace with appropriate folder ID if needed
        var fileId = pdfFile.save(); // Save the file and get its ID
        pdfFile = file.load({id: fileId})
        
        // Send email with the PDF attachment
        var recipientEmail = receipts; // Assuming receipts holds the recipient's email
        var emailSubject = subject || "Your Order Confirmation"; // Fallback if subject is empty
        var emailBody = body || "Please find attached your order confirmation."; // Fallback body
        var currentUserId = runtime.getCurrentUser().id;

        if (newRecord.getValue('custrecord_tc_load_confirmation_email')) {
         email.send({
          author: currentUserId, // Use -5 for the current user or replace with a specific internal ID
          recipients: to_array,
          subject: emailSubject,
          body: emailBody,
          cc: cc, // CC the email if provided
          attachments: [pdfFile], // Attach the PDF file
          relatedRecords: {
            transactionId: salesorderId
          }
        });
          
        }else{
          email.send({
          author: currentUserId, // Use -5 for the current user or replace with a specific internal ID
          recipients: to_array,
          subject: emailSubject,
          body: emailBody,
          cc: cc, // CC the email if provided
          attachments: [pdfFile], // Attach the PDF file
          relatedRecords: {
            transactionId: salesorderId
          }
        });
        }

        
        log.debug('Email Sent', 'Email sent successfully with PDF attachment.');
        
        file.delete({
          id: fileId
        });
        
      } catch (error) {
        log.error('Error in afterSubmit', error.toString());
      }
    }
  }

  function getEmailFromSOs(id) {
    var emailArray = [];

    var salesorderSearchObj = search.create({
   type: "transaction",
   filters:
   [
      ["custcol_tc_related_shipping_record","anyof",id], 
      "AND", 
      ["salesrep","noneof","@NONE@"]
   ],
   columns:
   [
      search.createColumn({
         name: "email",
         join: "salesRep",
         summary: "GROUP",
         sort: search.Sort.ASC,
         label: "Email"
      })
   ]
});
var searchResultCount = salesorderSearchObj.runPaged().count;
log.debug("salesorderSearchObj result count",searchResultCount);
salesorderSearchObj.run().each(function(result){
   var emailV = result.getValue({
         name: "email",
         join: "salesRep",
         summary: "GROUP",
   });

  if (emailV) emailArray.push(emailV)
   return true;
});

    if (emailArray.length > 0) return emailArray.join(',');
    else return null;
  }
  
  
  return {
    beforeLoad: beforeLoad,
    afterSubmit: afterSubmit
  };
});
