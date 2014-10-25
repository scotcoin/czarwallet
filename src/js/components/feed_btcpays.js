
/* the life of a CZRpay:

* user makes order to sell CZR
* order is matched with another order (to buy CZR, in return for some other asset)
* user's order listed as an *upcoming* CZRPay for 6 blocks. Shows up in the Waiting CZRpay feed with a clock icon.
* After 6 blocks, it's "safe" for the user to make a CZRpay against the item:
   -if automatic, a create_czrpay transaction is then immediately made. item does not show up in waiting CZRpays pane
   -if manual, the user is prompted to make payment. If they say "yes, do it now", things proceed simiarly to the automatic route
   above. if they say "no, hold off" the create_czrpay transaction is made once the user chooses to make it.
   the item then shows up in the waiting CZRpay feed with an exclamation point icon, and the user must make payment
* Once the user DOES make payment (automatic or manually), the czrpay is added to the pending actions list to show that
  the CZRPay is in progress (i.e. txn has been broadcast). (Note that if the user were to log out and back in during this time,
  we would see that the CZRpay is on the pending list and wouldn't show it as eligable to be paid.)
* Once confirmed on the network, the czrpay data is received across the message feed:
   -WaitingCZRPay is no longer marked as "inprogress". localstorage data is removed for it
   -Waiting CZRpay item is removed from waitingCZRPays
   -Notification item for this CZRPay is added to the notifications feed pane

* Basically: upcomingCZRPay -> waitingCZRPay -> pendingCZRPay -> completedCZRPay
* */
function CZRPayFeedViewModel() {
  var self = this;
  
  self.dispCount = ko.computed(function() {
    return WAITING_CZRPAY_FEED.entries().length + UPCOMING_CZRPAY_FEED.entries().length;
  }, self);
  
  self.dispLastUpdated = ko.computed(function() {
    return WAITING_CZRPAY_FEED.lastUpdated() >= UPCOMING_CZRPAY_FEED.lastUpdated() ? WAITING_CZRPAY_FEED.lastUpdated() : UPCOMING_CZRPAY_FEED.lastUpdated();
  }, self);
}


function WaitingCZRPayViewModel(czrPayData) {
  /* message is a message data object from the message feed for an order_match that requires a czr pay from an address in our wallet*/
  var self = this;
  self.CZRPAY_DATA = czrPayData;
  self.now = ko.observable(new Date()); //auto updates from the parent model every minute
  self.MATCH_EXPIRE_INDEX = self.CZRPAY_DATA['matchExpireIndex'];
  
  self.dispCZRQuantity = smartFormat(self.CZRPAY_DATA['czrQuantity']);
  self.dispMyAddr = getAddressLabel(self.CZRPAY_DATA['myAddr']);
  self.dispMyOrderTxHash = getTxHashLink(self.CZRPAY_DATA['myOrderTxHash']);
  
  self.expiresInNumBlocks = ko.computed(function() {
    return self.CZRPAY_DATA['matchExpireIndex'] - WALLET.networkBlockHeight();
  }, self);
  
  self.approxExpiresInTime = ko.computed(function() {
    return self.now().getTime() + (self.expiresInNumBlocks() * APPROX_SECONDS_PER_BLOCK * 1000);
  }, self);

  self.approxExpiresInTimeDisp = ko.computed(function() {
    return moment(self.approxExpiresInTime()).fromNow();
  }, self);
  
  self.displayColor = ko.computed(function() {
    if(self.approxExpiresInTime() - self.now() > 7200 * 1000) return 'bg-color-greenLight'; //> 2 hours
    if(self.approxExpiresInTime() - self.now() > 3600 * 1000) return 'bg-color-yellow'; //> 1 hour
    if(self.approxExpiresInTime() - self.now() > 1800 * 1000) return 'bg-color-orange'; //> 30 min
    return 'bg-color-red'; // < 30 min, or already expired according to our reough estimate
  }, self);
  
  self.completeCZRPay = function() {
    //check duplicate
    if (PROCESSED_CZRPAY[czrPayData['orderMatchID']]) {
      $.jqlog.error("Attempt to make duplicate czrpay: " + czrPayData['orderMatchID']);
      return false;
    } else if (self.expiresInNumBlocks()<=6) {
      $.jqlog.error("Attempt to make expired czrpay: " + czrPayData['orderMatchID']);
      return false;
    }
    
    //Pop up confirm dialog, and make CZR payment
    WALLET.retrieveCZRBalance(self.CZRPAY_DATA['myAddr'], function(balance) {
      if(balance < self.CZRPAY_DATA['czrQuantityRaw'] + MIN_PRIME_BALANCE) {
        bootbox.alert(i18n.t("no_balance_for_czr_pay", getAddressLabel(self.CZRPAY_DATA['myAddr'])));
        return;
      }
      
      bootbox.dialog({
        message: i18n.t("confirm_czr_payment", self.CZRPAY_DATA['czrQuantity'], getAddressLabel(self.CZRPAY_DATA['czrDestAddr']), self.CZRPAY_DATA['myOrderTxIndex']),
        title: i18n.t("confirm_order_settlement"),
        buttons: {
          cancel: {
            label: i18n.t("cancel"),
            className: "btn-default",
            callback: function() { } //just close the dialog
          },
          confirm: {
            label: i18n.t("confirm_and_pay"),
            className: "btn-success",
            callback: function() {
              //complete the CZRpay. Start by getting the current CZR balance for the address
              
              PROCESSED_CZRPAY[self.CZRPAY_DATA['orderMatchID']] = true; // before the transaction and not onSuccess, to avoid two tx in parallele

              WALLET.doTransaction(self.CZRPAY_DATA['myAddr'], "create_czrpay",
                { order_match_id: self.CZRPAY_DATA['orderMatchID'],
                  source: self.CZRPAY_DATA['myAddr'],
                  destBtcPay: self.CZRPAY_DATA['czrDestAddr']
                },
                function(txHash, data, endpoint, addressType, armoryUTx) {
                  //remove the CZR payment from the notifications (even armory tx at this point...)
                  WAITING_CZRPAY_FEED.remove(self.CZRPAY_DATA['orderMatchID']);
                }
              );
            }
          }
        }
      });
    });    
  }
}

function WaitingCZRPayFeedViewModel() {
  var self = this;
  self.entries = ko.observableArray([]);
  self.lastUpdated = ko.observable(new Date());
  
  self.entries.subscribe(function() {
    WALLET.isSellingCZR(self.entries().length + UPCOMING_CZRPAY_FEED.entries().length ? true : false);
  });

  //Every 60 seconds, run through all entries and update their 'now' members
  setInterval(function() {
    var now = new Date();
    for(var i=0; i < self.entries().length; i++) {
      self.entries()[i].now(now);
    }  
  }, 60 * 1000); 

  self.add = function(czrPayData, resort) {
    assert(czrPayData && czrPayData['orderMatchID']);
    //^ must be a CZRPayData structure, not a plain message from the feed or result from the API
    
    if(typeof(resort)==='undefined') resort = true;
    self.entries.unshift(new WaitingCZRPayViewModel(czrPayData));
    if(resort) self.sort();
    self.lastUpdated(new Date());
  }
  
  self.remove = function(orderHashOrMatchHash, data) {
    //data is supplied optionally to allow us to notify the user on a failed CZRpay...it's only used when called from messagesfeed.js
    // before we work with valid messages only
    var match = ko.utils.arrayFirst(self.entries(), function(item) {
      if(orderHashOrMatchHash == item.CZRPAY_DATA['orderMatchID']) return true; //matched by the entire order match hash
      //otherwise try to match on a single order hash
      var orderHash1 = item.CZRPAY_DATA['orderMatchID'].substring(0, 64);
      var orderHash2 = item.CZRPAY_DATA['orderMatchID'].substring(64);
      return orderHashOrMatchHash == orderHash1 || orderHashOrMatchHash == orderHash2;
    });
    if(match) {
      self.entries.remove(match);
      self.lastUpdated(new Date());
      return match;
    }
    return false;
  }
  
  self.sort = function() {
    //sort the pending CZRpays so that the entry most close to expiring is at top
    self.entries.sort(function(left, right) {
      return left.expiresInNumBlocks() == right.expiresInNumBlocks() ? 0 : (left.expiresInNumBlocks() < right.expiresInNumBlocks() ? -1 : 1);
    });      
  }

  self.restore = function() {
    //Get and populate any waiting CZR pays, filtering out those they are marked as in progress (i.e. are not waiting
    // for manual user payment, but waiting confirmation on the network instead -- we call these pendingCZRPays) to
    // avoid the possibility of double payment
    var addresses = WALLET.getAddressesList();
    var filters = [];
    for(var i=0; i < addresses.length; i++) {
      filters.push({'field': 'tx0_address', 'op': '==', 'value': addresses[i]});
      filters.push({'field': 'tx1_address', 'op': '==', 'value': addresses[i]});
    }

    failoverAPI("get_order_matches", {'filters': filters, 'filterop': 'or', status: 'pending'},
      function(data, endpoint) {
        $.jqlog.debug("Order matches: " + JSON.stringify(data));
        for(var i=0; i < data.length; i++) {
          //if the other party is the one that should be paying CZR for this specific order match, then skip it          
          if(   WALLET.getAddressObj(data['tx0_address']) && data['forward_asset'] == 'CZR'
             || WALLET.getAddressObj(data['tx1_address']) && data['backward_asset'] == 'CZR')
             continue;
          
          //if here, we have a pending order match that we owe CZR for. 
          var orderMatchID = data[i]['tx0_hash'] + data[i]['tx1_hash'];
          
          //next step is that we need to check if it's one we have paid, but just hasn't been confirmed yet. check
          // the pendingactions feed to see if the CZRpay is pending
          var pendingCZRPay = $.grep(PENDING_ACTION_FEED.entries(), function(e) {
            return e['CATEGORY'] == 'czrpays' && e['DATA']['order_match_id'] == orderMatchID;
          })[0];
          if(pendingCZRPay) {
            $.jqlog.debug("pendingCZRPay:restore:not showing czrpay request for order match ID: " + orderMatchID);
          } else {
            //not paid yet (confirmed), nor is it a pending action
            var czrPayData = WaitingCZRPayFeedViewModel.makeCZRPayData(data[i]);            
            if (czrPayData) {
              if(WALLET.networkBlockHeight() - czrPayData['blockIndex'] < NUM_BLOCKS_TO_WAIT_FOR_CZRPAY) {
                //If the order match is younger than NUM_BLOCKS_TO_WAIT_FOR_CZRPAY blocks, then it's actually still an
                // order that should be in the upcomingCZRPay feed
                UPCOMING_CZRPAY_FEED.add(czrPayData);
              } else {
                //otherwise, if not already paid and awaiting confirmation, show it as a waiting CZRpay
                WAITING_CZRPAY_FEED.add(czrPayData);
              }
            }
          }
        }
          
        //Sort upcoming czrpay and waiting czrpay lists
        UPCOMING_CZRPAY_FEED.sort();
        WAITING_CZRPAY_FEED.sort();
      }
    );
  }
}
WaitingCZRPayFeedViewModel.makeCZRPayData = function(data) {
  //data is a pending order match object (from a data feed message received, or from a get_orders API result)
  var firstInPair = (WALLET.getAddressObj(data['tx0_address']) && data['forward_asset'] == 'CZR') ? true : false;
  if(!firstInPair) if (!(WALLET.getAddressObj(data['tx1_address']) && data['backward_asset'] == 'CZR')) return false;
  
  return {
    blockIndex: data['tx1_block_index'], //the latter block index, which is when the match was actually made
    matchExpireIndex: data['match_expire_index'],
    orderMatchID: data['tx0_hash'] + data['tx1_hash'],
    myAddr: firstInPair ? data['tx0_address'] : data['tx1_address'],
    czrDestAddr: firstInPair ? data['tx1_address'] : data['tx0_address'],
    czrQuantity: normalizeQuantity(firstInPair ? data['forward_quantity'] : data['backward_quantity'], true), //normalized
    czrQuantityRaw: firstInPair ? data['forward_quantity'] : data['backward_quantity'],
    myOrderTxIndex: firstInPair ? data['tx0_index'] : data['tx1_index'],
    myOrderTxHash: firstInPair ? data['tx0_hash'] : data['tx1_hash'],
    otherOrderTxIndex: firstInPair ? data['tx1_index'] : data['tx0_index'],
    otherOrderAsset: firstInPair ? data['backward_asset'] : data['forward_asset'],
    otherOrderQuantity: normalizeQuantity(firstInPair ? data['backward_quantity'] : data['forward_quantity'],
      firstInPair ? data['_backward_asset_divisible'] : data['_forward_asset_divisible']), //normalized
    otherOrderQuantityRaw: firstInPair ? data['backward_quantity'] : data['forward_quantity']
  }
}


function UpcomingCZRPayViewModel(czrPayData) {
  /* message is a message data object from the message feed for an order_match that requires a czr pay from an address in our wallet*/
  var self = this;
  self.CZRPAY_DATA = czrPayData;
  self.now = ko.observable(new Date()); //auto updates from the parent model every minute
  
  self.dispCZRQuantity = smartFormat(self.CZRPAY_DATA['czrQuantity']);
  self.dispMyOrderTxHash = getTxHashLink(self.CZRPAY_DATA['myOrderTxHash']);
  
  self.numBlocksUntilEligible = ko.computed(function() {
    return Math.max(NUM_BLOCKS_TO_WAIT_FOR_CZRPAY - (WALLET.networkBlockHeight() - self.CZRPAY_DATA['blockIndex']), 0);
  }, self);
  
  self.approxTimeUntilEligible = ko.computed(function() {
    return self.now().getTime() + (self.numBlocksUntilEligible() * APPROX_SECONDS_PER_BLOCK * 1000);
  }, self);

  self.approxTimeUntilEligibleDisp = ko.computed(function() {
    return moment().fromNow(self.approxTimeUntilEligible());
  }, self);
}

function UpcomingCZRPayFeedViewModel() {
  /* when an order match occurs where we owe CZR, a czrpay transaction should be made. Due to the potential of a 
   * blockchain reorg happening at any time, we delay the czrpay by 6 or so blocks so that (barring some kind of catastrophic
   * sized reorg) we're sure that by the time of the bTCpay, the user is making a payment against a real order (i.e. one
   * that won't "disappear" potentially, if there is a reorg)
   */
  var self = this;
  self.entries = ko.observableArray([]);
  self.lastUpdated = ko.observable(new Date());
  
  self.entries.subscribe(function() {
    WALLET.isSellingCZR(WAITING_CZRPAY_FEED.entries().length + self.entries().length ? true : false);
  });
  
  //Every 60 seconds, run through all entries and update their 'now' members
  setInterval(function() {
    var now = new Date();
    for(var i=0; i < self.entries().length; i++) {
      self.entries()[i].now(now);
      
      //if this czrpay is now eligible, process it
      if(self.entries()[i].numBlocksUntilEligible() == 0)
        self.process(self.entries()[i]['CZRPAY_DATA']);
    }  
  }, 60 * 1000); 

  self.add = function(czrPayData, resort) {
    assert(czrPayData && czrPayData['orderMatchID']);
    //^ must be a CZRPayData structure, not a plain message from the feed or result from the API

    if(typeof(resort)==='undefined') resort = true;
    // check duplicate
    for (var e in self.entries) {
      if (self.entries[e].CZRPAY_DATA && self.entries[e].CZRPAY_DATA['orderMatchID'] == czrPayData['orderMatchID']) {
        $.jqlog.error("Attempt to make duplicate czrpay: " + czrPayData['orderMatchID']);
        return false;
      }
    }
    self.entries.unshift(new UpcomingCZRPayViewModel(czrPayData));
    if(resort) self.sort();
    self.lastUpdated(new Date());
  }
  
  self.remove = function(orderHashOrMatchHash) {
    var match = ko.utils.arrayFirst(self.entries(), function(item) {
      if(orderHashOrMatchHash == item.CZRPAY_DATA['orderMatchID']) return true; //matched by the entire order match hash
      //otherwise try to match on a single order hash
      var orderHash1 = item.CZRPAY_DATA['orderMatchID'].substring(0, 64);
      var orderHash2 = item.CZRPAY_DATA['orderMatchID'].substring(64);
      return orderHashOrMatchHash == orderHash1 || orderHashOrMatchHash == orderHash2;
    });
    if(match) {
      self.entries.remove(match);
      self.lastUpdated(new Date());
      return match;
    }
    return false;
  }
  
  self.sort = function() {
    //sort the upcoming CZRpays so that the entry most close to becoming eligible is on top
    self.entries.sort(function(left, right) {
      return left.numBlocksUntilEligible() == right.numBlocksUntilEligible() ? 0 : (left.numBlocksUntilEligible() < right.numBlocksUntilEligible() ? -1 : 1);
    });
  }
  
  self.process = function(czrPayData) {
    //The czrpay required is no longer "upcoming" and a create_czrpay should be broadcast...

    //check duplicate
    if (PROCESSED_CZRPAY[czrPayData['orderMatchID']]) {
      $.jqlog.error("Attempt to make duplicate czrpay: " + czrPayData['orderMatchID']);
      return false;
    } else if (czrPayData['matchExpireIndex'] - WALLET.networkBlockHeight() <= 6) {
      $.jqlog.error("Attempt to make expired czrpay: " + czrPayData['orderMatchID']);
      return false;
    } else {
      PROCESSED_CZRPAY[czrPayData['orderMatchID']] = true;
    }
    
    //remove the entry from the "upcoming" list, as it will be migrating to the "waiting" list
    self.remove(czrPayData['orderMatchID']);
        
    //If automatic CZR pays are enabled, just take care of the CZR pay right now
    if(PREFERENCES['auto_czrpay']) {

      if(WALLET.getBalance(czrPayData['myAddr'], 'CZR', false) >= (czrPayData['czrQuantityRaw']) + MIN_PRIME_BALANCE) {
        
         //user has the sufficient balance
        WALLET.doTransaction(czrPayData['myAddr'], "create_czrpay",
          { order_match_id: czrPayData['orderMatchID'], source: czrPayData['myAddr'], destBtcPay: czrPayData['czrDestAddr'] },
          function(txHash, data, endpoint, addressType, armoryUTx) {
            //notify the user of the automatic CZR payment
            var message = i18n.t("auto_czrpay_done", czrPayData['czrQuantity'], czrPayData['myAddr'], czrPayData['otherOrderQuantity'], czrPayData['otherOrderAsset']);
            WALLET.showTransactionCompleteDialog(message + " " + i18n.t(ACTION_PENDING_NOTICE), message, armoryUTx);
          }, function() {
            WAITING_CZRPAY_FEED.add(czrPayData);
            bootbox.alert(i18n.t("auto_czrpay_error"));
          }
        );

      } else {

        //The user doesn't have the necessary balance on the address... let them know and add the CZR as pending
        WAITING_CZRPAY_FEED.add(czrPayData);
        WALLET.showTransactionCompleteDialog(i18n.t("czrpay_required", czrPayData['czrQuantity'], getAddressLabel(czrPayData['myAddr'])));  
      }

    } else {
      //Otherwise, prompt the user to make the CZR pay
      var prompt = i18n.t("order_match_succesfull", czrPayData['otherOrderQuantity'], czrPayData['otherOrderAsset'], czrPayData['czrQuantity'], getAddressLabel(czrPayData['myAddr']));          
      bootbox.dialog({
        message: prompt,
        title: i18n.t("order_settlement"),
        buttons: {
          success: {
            label: i18n.t("no_hold_off"),
            className: "btn-danger",
            callback: function() {
              //If the user says no, then throw the CZR pay in pending CZR pays
              WAITING_CZRPAY_FEED.add(czrPayData);
            }
          },
          danger: {
            label: i18n.t("yes"),
            className: "btn-success",
            callback: function() {
              WALLET.doTransaction(czrPayData['myAddr'], "create_czrpay",
                { order_match_id: czrPayData['orderMatchID'], source: czrPayData['myAddr'], destBtcPay: czrPayData['czrDestAddr'] },
                function(txHash, data, endpoint, addressType, armoryUTx) {
                  //notify the user of the automatic CZR payment
                  var message = "";
                  if (armoryUTx) {
                    message = i18n.t("auto_czrpay_to_be_made", czrPayData['czrQuantity'], getAddressLabel(czrPayData['myAddr']), czrPayData['otherOrderQuantity'], czrPayData['otherOrderAsset']);
                  } else {
                    message = i18n.t("auto_czrpay_made", czrPayData['czrQuantity'], getAddressLabel(czrPayData['myAddr']), czrPayData['otherOrderQuantity'], czrPayData['otherOrderAsset']);
                  } 
                  WALLET.showTransactionCompleteDialog(message + " " + i18n.t(ACTION_PENDING_NOTICE), message, armoryUTx);
                }, function() {
                  WAITING_CZRPAY_FEED.add(czrPayData);
                  bootbox.alert(i18n.t("auto_czrpay_error"));
                }
              );
            }
          }
        }
      });    
    }
  }


}


/*NOTE: Any code here is only triggered the first time the page is visited. Put JS that needs to run on the
  first load and subsequent ajax page switches in the .html <script> tag*/
