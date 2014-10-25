
var AssetLeaderboardViewModel = CClass.create(function() {
  var self = this;
  self.isLeaderboard = null;
  self.marketInfo = null;
  self.marketCapHistory = null; //only used for leaderboard
  self.showPortfolioIn = ko.observable('');
  self.marketCapTables = ko.observableArray([
    {'base': 'XZR', 'data': ko.observableArray([])},
    {'base': 'CZR', 'data': ko.observableArray([])}
  ]);
  self._lastWindowWidth = null;
  
  self.init = function(assets) {
    //Get a list of all assets the user has
    self.isLeaderboard = !assets;
    failoverAPI(self.isLeaderboard ? "get_market_info_leaderboard" : "get_market_info", self.isLeaderboard ? {} : {assets: assets}, function(data, endpoint) {
      self.marketInfo = data;
      self.updateMarketInfo();
      self.showPortfolioIn("XZR"); //causes the table to be generated off of self.marketInfo
    });
    
    if(self.isLeaderboard) {
      failoverAPI("get_market_cap_history", {}, function(data, endpoint) {
        self.marketCapHistory = data;
        self.generateMarketCapHistoryGraph();
      });
    }
  }
  
  self.updateMarketInfo = function() {
    //Compose the table this has changed
    var i = null, j = null, marketInfo = null;
    
    //label XZR marketcap positions
    marketInfo = self.isLeaderboard ? self.marketInfo['xzr'] : self.marketInfo; 
    marketInfo.sort(
      function(l, r) {
        return l['market_cap_in_xzr'] == r['market_cap_in_xzr'] ? 0 : (l['market_cap_in_xzr'] < r['market_cap_in_xzr'] ? 1 : -1)
      }
    );
    for(i=0; i < marketInfo.length; i++) {
      marketInfo[i]['position_xzr'] = i + 1;
    }
    assert(self.marketCapTables()[0]['base'] == 'XZR');
    for(i=0; i < marketInfo.length; i++) {
      if(!marketInfo[i]['price_in_xzr']) continue;
      self.marketCapTables()[0]['data'].push({
        position: marketInfo[i]['position_xzr'],
        asset: marketInfo[i]['asset'],
        dispAsset: AssetLeaderboardViewModel.formulateExtendedAssetInfo(marketInfo[i]['asset'],
          marketInfo[i]['extended_image'], marketInfo[i]['extended_website']),
        marketCap: marketInfo[i]['market_cap_in_xzr'] ? (smartFormat(marketInfo[i]['market_cap_in_xzr'], 100, 0) + ' XZR') : '',
        price: marketInfo[i]['aggregated_price_as_xzr'] ? (smartFormat(marketInfo[i]['aggregated_price_as_xzr'], 10, 4) + ' XZR') : '',
        supply: smartFormat(marketInfo[i]['total_supply'], 100, 4) + ' ' + marketInfo[i]['asset'],
        //volume: marketInfo[i]['24h_summary']['vol'] ? (smartFormat(marketInfo[i]['24h_summary']['vol'], 100, 4) + ' ' + marketInfo[i]['asset']) : '',
        //volume: (marketInfo[i]['24h_ohlc_in_xzr']['vol'] && marketInfo[i]['aggregated_price_in_xzr']) 
        //  ? (smartFormat(marketInfo[i]['24h_ohlc_in_xzr']['vol'] * marketInfo[i]['aggregated_price_in_xzr'], 0, 4) + ' XZR') : '',
        volume: (marketInfo[i]['24h_summary'] && marketInfo[i]['24h_summary']['vol'] && marketInfo[i]['aggregated_price_in_xzr']) 
          ? (smartFormat(marketInfo[i]['24h_summary']['vol'] * marketInfo[i]['aggregated_price_in_xzr'], 10, 4) + ' XZR') : '',
        pctChange: marketInfo[i]['24h_vol_price_change_in_xzr'] ? (smartFormat(marketInfo[i]['24h_vol_price_change_in_xzr'], 0, 2) + ' %') : '',
        pctChangeColorClass: marketInfo[i]['24h_vol_price_change_in_xzr'] > 0 ? 'txt-color-green' : (marketInfo[i]['24h_vol_price_change_in_xzr'] < 0 ? 'txt-color-red' : 'initial'),
        history: marketInfo[i]['7d_history_in_xzr'],

        marketCapRaw: marketInfo[i]['market_cap_in_xzr'],
        priceRaw: marketInfo[i]['aggregated_price_as_xzr'],
        supplyRaw: marketInfo[i]['total_supply'],
        volumeRaw: marketInfo[i]['24h_ohlc_in_xzr'] ? marketInfo[i]['24h_ohlc_in_xzr']['vol'] : 0,
        pctChangeRaw: marketInfo[i]['24h_vol_price_change_in_xzr']
      });
    }
    
    //label CZR marketcap positions
    marketInfo = self.isLeaderboard ? self.marketInfo['czr'] : self.marketInfo; 
    marketInfo.sort(
      function(l, r) {
        return l['market_cap_in_czr'] == r['market_cap_in_czr'] ? 0 : (l['market_cap_in_czr'] < r['market_cap_in_czr'] ? 1 : -1)
      }
    );
    for(i=0; i < marketInfo.length; i++) {
      marketInfo[i]['position_czr'] = i + 1;
    }
    assert(self.marketCapTables()[1]['base'] == 'CZR');
    for(i=0; i < marketInfo.length; i++) {
      if(!marketInfo[i]['price_in_czr']) continue;
      self.marketCapTables()[1]['data'].push({
        position: marketInfo[i]['position_czr'],
        asset: marketInfo[i]['asset'],
        dispAsset: AssetLeaderboardViewModel.formulateExtendedAssetInfo(marketInfo[i]['asset'],
          marketInfo[i]['extended_image'], marketInfo[i]['extended_website']),
        marketCap: marketInfo[i]['market_cap_in_czr'] ? (smartFormat(marketInfo[i]['market_cap_in_czr'], 100, 0) + ' CZR') : '',
        price: marketInfo[i]['aggregated_price_as_czr'] ? (smartFormat(marketInfo[i]['aggregated_price_as_czr'], 10, 4) + ' CZR') : '',
        supply: smartFormat(marketInfo[i]['total_supply'], 100, 4) + ' ' + marketInfo[i]['asset'],
        //volume: marketInfo[i]['24h_summary']['vol'] ? (smartFormat(marketInfo[i]['24h_summary']['vol'], 100, 4) + ' ' + marketInfo[i]['asset']) : '',
        //volume: (marketInfo[i]['24h_ohlc_in_czr']['vol'] && marketInfo[i]['aggregated_price_in_czr']) 
        //  ? (smartFormat(marketInfo[i]['24h_ohlc_in_czr']['vol'] * marketInfo[i]['aggregated_price_in_czr'], 0, 4) + ' CZR') : '',
        volume: (marketInfo[i]['24h_summary'] && marketInfo[i]['24h_summary']['vol'] && marketInfo[i]['aggregated_price_in_czr']) 
          ? (smartFormat(marketInfo[i]['24h_summary']['vol'] * marketInfo[i]['aggregated_price_in_czr'], 10, 4) + ' CZR') : '',
        pctChange: marketInfo[i]['24h_vol_price_change_in_czr'] ? (smartFormat(marketInfo[i]['24h_vol_price_change_in_czr'], 0, 2) + ' %') : '',
        pctChangeColorClass: marketInfo[i]['24h_vol_price_change_in_czr'] > 0 ? 'txt-color-green' : (marketInfo[i]['24h_vol_price_change_in_czr'] < 0 ? 'txt-color-red' : 'initial'),
        history: marketInfo[i]['7d_history_in_czr'],

        marketCapRaw: marketInfo[i]['market_cap_in_czr'],
        priceRaw: marketInfo[i]['aggregated_price_as_czr'],
        supplyRaw: marketInfo[i]['total_supply'],
        volumeRaw: marketInfo[i]['24h_ohlc_in_czr'] ? marketInfo[i]['24h_ohlc_in_czr']['vol'] : 0,
        pctChangeRaw: marketInfo[i]['24h_vol_price_change_in_czr']
      });
    }
    
    runDataTables('.assetMarketTable', true, {
      "iDisplayLength": self.isLeaderboard ? 50 : 15,
      "aaSorting": [ [0, 'asc'] ],
       "aoColumns": [
         {"sType": "numeric"}, //asset
         {"sType": "string"}, //asset
         {"sType": "natural", "iDataSort": 8}, //market cap
         {"sType": "natural", "iDataSort": 9}, //price
         {"sType": "natural", "iDataSort": 10}, //total supply
         {"sType": "natural", "iDataSort": 11}, //volume
         {"sType": "natural", "iDataSort": 12}, //pct change
         {"sWidth": "180px", "bSortable": false}, //graph
         {"bVisible": false}, //market cap RAW
         {"bVisible": false}, //price RAW
         {"bVisible": false}, //total supply RAW
         {"bVisible": false}, //volume RAW
         {"bVisible": false}  //pctchange RAW
       ]
    });
    self.generateAssetMiniCharts();
  }
  
  self.showPortfolioInXZR = function() {
    self.showPortfolioIn("XZR");
  }
  
  self.showPortfolioInCZR = function() {
    self.showPortfolioIn("CZR");
  }
  
  self.showPortfolioIn.subscribeChanged(function(newValue, prevValue) {
    if(!prevValue) return; //initial setting on initialization, ignore
    assert(newValue == "XZR" || newValue == "CZR", "Invalid value");
    if(newValue == prevValue) return; //no change
    if(self.isLeaderboard) {
      self.generateMarketCapHistoryGraph(); //regenerate for switch to different data
    }
  });  
  
  self.generateAssetMiniCharts = function() {
    //Generate the asset portfolio mini charts
    var i = null, j = null;
    for(i=0; i < self.marketCapTables().length; i++) {
      for(j=0; j < self.marketCapTables()[i]['data']().length; j++) {
        $('#miniChart-' + self.marketCapTables()[i]['base'] + '-' + self.marketCapTables()[i]['data']()[j]['asset']).highcharts({
          title: { text: null },
          xAxis: { type: 'datetime', title: { text: null } },
          yAxis: { title: { text: null } },
          credits: { enabled: false },
          tooltip: { enabled: false },
          legend: { enabled: false },
          series: [{
            name: 'data',
            type: 'scatter',
            data: self.marketCapTables()[i]['data']()[j]['history']
          }]
        });
      }
    }
  }
  
  self.generateMarketCapHistoryGraph = function() {
    assert(self.isLeaderboard);
    $('#marketCapHistoryGraph').highcharts({
        title: {
          text: null
        },
        xAxis: {
          type: 'datetime',
          dateTimeLabelFormats: { // don't display the dummy year
            month: '%e. %b',
            year: '%b'
          }
        },        
        yAxis: {
          type: 'logarithmic'
        },
        tooltip: {
          pointFormat: '<span style="color:{series.color}">{series.name}</span>: <b>{point.y}</b><br/>',
          valueDecimals: 2
        },
        credits: {
          enabled: false
        },
        series: self.marketCapHistory[self.showPortfolioIn()]
    });    
  }

  self.dataTableResponsive = function(e) {
    // Responsive design for our data tables and more on this page
    var newWindowWidth = $(window).width();
    
    if(self._lastWindowWidth && newWindowWidth == self._lastWindowWidth) return;
    self._lastWindowWidth = newWindowWidth;

    if($('#assetMarketInfo').hasClass('dataTable')) {
      var txnHistory = $('#assetMarketInfo').dataTable();
      if(newWindowWidth < 1250) { //hide some...
        txnHistory.fnSetColumnVis(3, false); //hide total supply
      }
      if(newWindowWidth >= 1250) { //show it all, baby
        txnHistory.fnSetColumnVis(3, true); //show block
      }
      txnHistory.fnAdjustColumnSizing();
    }
  }
});
AssetLeaderboardViewModel.formulateExtendedAssetInfo = function(asset, hasImage, website) {
  //determine asset image
  var dispAsset = asset;
  if(asset == 'XZR' || asset == 'CZR') {
    dispAsset = '<img src="assets/' + asset + '.png" />&nbsp;';
    var website = asset == 'XZR' ? "http://www.czarparty.co" : "http://www.czarcoin.org";
    dispAsset += '<a href="' + website + '" target="_blank">' + asset + '</a>';
  } else if(hasImage) {
    dispAsset = '<img src="' + (USE_TESTNET ? '/_t_asset_img/' : '/_asset_img/') + asset + '.png" />&nbsp;';
    //dispAsset += website ? ('<a href="' + website + '" target="_blank">' + asset + '</a>') : asset;
    dispAsset += asset; //keep it simple for now for avoid XSS
  }
  return dispAsset;
}

/*NOTE: Any code here is only triggered the first time the page is visited. Put JS that needs to run on the
  first load and subsequent ajax page switches in the .html <script> tag*/
