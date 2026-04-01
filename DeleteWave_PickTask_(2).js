/**
* @NApiVersion 2.x
* @NScriptType UserEventScript
* @NModuleScope SameAccount
*/
define(['N/record','N/search'], function(record,search) {
  
  function afterSubmit(context) {
    try {
      if (context.type != context.UserEventType.DELETE) {
        
        var newRecord = context.newRecord;
        
        var scrap_record = newRecord.getValue({
          fieldId: 'custbody_ds_scrap_record'
        });
        log.debug('scrap_record', scrap_record)
        
        var wave = newRecord.getValue({
          fieldId: 'custbodycustbody_ds_related_wave'
        });
        log.debug('wave', wave)
        
        if(scrap_record && !isEmpty(wave)){
          
          var status_lookup = search.lookupFields({
            type: search.Type.WAVE,
            id: wave,
            columns: ['status']
          });
          log.debug('status_lookup', status_lookup)
          
          var status = status_lookup['status'][0].text;
          log.debug('status', status)
          
          if(status == 'Pending Release'){
            record.delete({
              type:record.Type.WAVE,
              id:wave
            });
          }else if(status != 'Pending Release'){
            
            var pickTaskReady = VerifyPickTaskStatus(wave);
        //    var pickTaskReady = VerifyPickTaskStatus(wave);
            log.debug('pickTaskReady', pickTaskReady)
            
            if(pickTaskReady){
              record.delete({
                type:record.Type.WAVE,
                id:wave
              });
            }
          }
        }
      }
    } catch (e) {
      log.error({
        title: 'Error in Before Submit User Event',
        details: e
      });
    }
  }
  
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
  
  
  function VerifyPickTaskStatus(wave){
    var allPickTaskReady = true;
    var picktaskSearchObj = search.create({
      type: "picktask",
      filters:
      [
        ["wavename","anyof",wave]
      ],
      columns:
      [
        search.createColumn({name: "internalid",summary: "GROUP", label: "Internal ID"}),
        search.createColumn({name: "status",summary: "GROUP", label: "Pick Task Status"}),
        search.createColumn({name: "lineitemstatus",summary: "GROUP", label: "Line Item Status"})
      ]
    });
    var searchResultCount = picktaskSearchObj.runPaged().count;
    log.debug("picktaskSearchObj result count",searchResultCount);
    picktaskSearchObj.run().each(function(result){
      var pickTaskStatus = result.getText({
        name: "status",
        summary: "GROUP"
      })
      log.debug("pickTaskStatus",pickTaskStatus);
      
      var pick_id = result.getValue({
        name: "internalid",
        summary: "GROUP"
      })
      log.debug("pick_id",pick_id);
      
      if(pickTaskStatus == 'Ready'){
      //  allPickTaskReady = false;

      var pick_record = record.load({type:'picktask',id:pick_id,isDynamic:true});
      pick_record.save();
        
        record.delete({
          type:'picktask',
          id:pick_id
        });
        
      }

      else if(pickTaskStatus == 'In Progress'){
        
        var pick_rec = record.load({type:'picktask',id:pick_id,isDynamic:true}) 
        var pickLine = pick_rec.getLineCount({sublistId:'pickactions'})
        
        for (i = 0; i < pickLine; i++) {
          pick_rec.selectLine({sublistId:'pickactions',line:i})
          var current_status =  pick_rec.getCurrentSublistValue({sublistId:'pickactions',fieldId:'status'})
          log.debug('current_status',current_status)
          if (current_status != 'PICKED' && current_status != 'STARTED') {
            pick_rec.setCurrentSublistText({sublistId:'pickactions',fieldId:'status',text:'Staged'})
          }          
          pick_rec.commitLine({sublistId:'pickactions'})
        }
        var saved_pick = pick_rec.save();
        log.debug('saved_pick',saved_pick)
        
        if (saved_pick) {
          var load_again =  record.load({type:'picktask',id:pick_id,isDynamic:true}) 
          var pickLine_01 = load_again.getLineCount({sublistId:'pickactions'})
          
          for (m = 0; m < pickLine_01; m++) {
            load_again.selectLine({sublistId:'pickactions',line:m})
            load_again.setCurrentSublistText({sublistId:'pickactions',fieldId:'stagingbin',text:''})
            load_again.setCurrentSublistValue({sublistId:'pickactions',fieldId:'pickedquantity',value:0})
            load_again.commitLine({sublistId:'pickactions'})
          }
          var loaded_pick = load_again.save(); 
          
          if (loaded_pick) {

              var load_again01 =  record.load({type:'picktask',id:pick_id,isDynamic:true}) 
          var pickLine_02 = load_again01.getLineCount({sublistId:'pickactions'})
          
          for (m = 0; m < pickLine_02; m++) {
            load_again01.selectLine({sublistId:'pickactions',line:m})
            load_again01.setCurrentSublistText({sublistId:'pickactions',fieldId:'status',text:'Ready'})
            load_again01.commitLine({sublistId:'pickactions'})
          }
           load_again01.save(); 

           var pick_record = record.load({type:'picktask',id:pick_id,isDynamic:true});
           pick_record.save();
           
            record.delete({
              type:'picktask',
              id:pick_id
            }); 
          }
        }             
      }

      else if(pickTaskStatus == 'Done'){

        var pick_record = record.load({type:'picktask',id:pick_id,isDynamic:true}) 
        var pick_Line = pick_record.getLineCount({sublistId:'pickactions'})
        
        for (i = 0; i < pick_Line; i++) {
          pick_record.selectLine({sublistId:'pickactions',line:i})

          var itemfull_id = pick_record.getCurrentSublistValue({sublistId:'pickactions',fieldId:'transactionnumber'})
          if (itemfull_id) {
            record.delete({
              type:'itemfulfillment',
              id:itemfull_id
            }); 
          }
          pick_record.commitLine({sublistId:'pickactions'})
        }

        var pick_rec = record.load({type:'picktask',id:pick_id,isDynamic:true}) 
        var pickLine = pick_rec.getLineCount({sublistId:'pickactions'})
        
        for (j = 0; j < pickLine; j++) {
          pick_rec.selectLine({sublistId:'pickactions',line:j})
          pick_rec.setCurrentSublistText({sublistId:'pickactions',fieldId:'status',text:'Staged'})
          pick_rec.commitLine({sublistId:'pickactions'})
        }
        var saved_pick = pick_rec.save();
        
        if (saved_pick) {
          var load_again =  record.load({type:'picktask',id:pick_id,isDynamic:true}) 
          var pickLine_01 = load_again.getLineCount({sublistId:'pickactions'})
          
          for (m = 0; m < pickLine_01; m++) {
            load_again.selectLine({sublistId:'pickactions',line:m})
            load_again.setCurrentSublistText({sublistId:'pickactions',fieldId:'stagingbin',text:''})
            load_again.setCurrentSublistValue({sublistId:'pickactions',fieldId:'pickedquantity',value:0})
            load_again.commitLine({sublistId:'pickactions'})
          }
          var loaded_pick = load_again.save(); 
          
          if (loaded_pick) {
          var load_again01 =  record.load({type:'picktask',id:pick_id,isDynamic:true}) 
          var pickLine_02 = load_again01.getLineCount({sublistId:'pickactions'})
          
          for (m = 0; m < pickLine_02; m++) {
            load_again01.selectLine({sublistId:'pickactions',line:m})
            load_again01.setCurrentSublistText({sublistId:'pickactions',fieldId:'status',text:'Ready'})
            load_again01.commitLine({sublistId:'pickactions'})
          }
           load_again01.save(); 

           var pick_record = record.load({type:'picktask',id:pick_id,isDynamic:true});
           pick_record.save();
           
            record.delete({
              type:'picktask',
              id:pick_id
            }); 
          }
        
      }
    }
      
      return true;
    });
    
    return allPickTaskReady;
  }
  
  return {
    afterSubmit: afterSubmit
  };
  
});
