function onOpen() {
  SpreadsheetApp.getUi().createMenu('SK Tech Admin')
    .addItem('Block or unblock interview slots', 'showAdminSidebar').addToUi();
}

function showAdminSidebar() {
  SKBackend.adminGetBootstrap();
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('AdminSidebar').setTitle('Availability controls'));
}

function adminGetBootstrap() { return SKBackend.adminGetBootstrap(); }
function adminAddSlotBlock(input) { return SKBackend.adminAddSlotBlock(input); }
function adminAddSpecialOpen(input) { return SKBackend.adminAddSpecialOpen(input); }
function adminSetRuleActive(input) { return SKBackend.adminSetRuleActive(input); }
