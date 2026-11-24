// Export documentation is evidence of a file route, not a certified vendor connector.
export const importEvidence={
 personio:{formats:['CSV','Excel'],sources:['https://support.personio.de/hc/en-us/articles/115003457605-The-monthly-payroll-process-in-Personio','https://support.personio.de/hc/en-us/articles/15718133638685-Create-a-report']},
 lexware:{formats:['ASCII','Excel'],sources:['https://shop.lexware.de/unternehmen/lohn-und-gehalt-abrechnen/lexware-lohn-gehalt']},
 datev:{formats:['DLS export'],sources:['https://www.datev.de/students/mod/resource/view.php?id=6309'],caution:'MULTI_FILE_ADAPTER_REQUIRED'},
 sap:{formats:['CSV','TXT','XML'],sources:['https://help.sap.com/docs/successfactors-platform/using-integration-center'],caution:'EDI_NOT_SUPPORTED'},
 bmd:{formats:[],sources:['https://www.bmd.com/at/das-ist-bmd/neuigkeiten/d/so-erstellen-sie-auswertungen-im-bmd-ntcs-lohn'],caution:'EXACT_EXPORT_LAYOUT_NOT_VERIFIED'},
 rzl:{formats:['ASCII'],sources:['https://hilfe.rzlsoftware.at/LOHN/Ausdrucke/Allgemeine_Informationen/','https://rzlsoftware.at/fileadmin/user_upload/PDF_Schnittstelle/RZL_LOHN_Import_Schnittstelle.pdf']},
 pantheon:{formats:['Excel'],sources:['https://www.datalab.si/katalog/zdruzen-izpis-o-zaposlenih-in-obracunu-plac/']},
 minimax:{formats:['Excel'],sources:['https://help.minimax.si/help/dohodnina','https://help.minimax.si/help/place-pregledi-izpisi-in-izvozi']},
 saop:{formats:['Excel'],sources:['https://help.saop.si/help/nova-analiza-analiza-obracunov-z-obracunskimi-vrsticami']},
 vasco:{formats:['Excel (DU report)'],sources:['https://www.vasco.si/podpora/place/delovna-uspesnost-v-js-po-novem-modul-du-2026/'],caution:'PARTIAL_REPORT_NOT_COMPLETE_PAYROLL'},
};
export function exportVerification(id){return {checkedOn:'2026-11-15',vendorSampleTested:false,directConnector:false,...(importEvidence[id]||{formats:[],sources:[],caution:'EXPORT_LAYOUT_NOT_VERIFIED'})};}
