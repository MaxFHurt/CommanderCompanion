export const MODE_POLICIES={
 'fully-tracked':{globalCardSearch:false,privateDeck:true,legality:'strict',battlefield:true,hand:true},
 freeplay:{globalCardSearch:true,privateDeck:true,legality:'advisory',battlefield:true,hand:true},
 'table-tracker':{globalCardSearch:false,privateDeck:false,legality:'none',battlefield:false,hand:false},
 tabletop:{globalCardSearch:false,privateDeck:false,legality:'none',battlefield:false,hand:false}
};
export const modePolicy=mode=>MODE_POLICIES[mode]||MODE_POLICIES['fully-tracked'];
