import { CustomBuildingDef } from '../mapData';
import { DistrictId, RoadType } from '../RoadGraph';

export type NWNodeTuple = readonly [
  id: string,
  x: number,
  z: number,
  district: DistrictId,
  hasTrafficLight: 0 | 1,
];

export type NWEdgeTuple = readonly [
  from: string,
  to: string,
  name: string,
  roadType: RoadType,
  lanesPerDir: number,
  speedLimit: number,
  width: number,
  sidewalkWidth: number,
  isShortcut?: 0 | 1,
  isOneWay?: 0 | 1,
  roundaboutId?: string,
  roundaboutCenter?: readonly [number, number, number],
];

/**
 * Extended NW road network around Auchan Mikołów, Leroy Merlin, Decathlon,
 * KP Park, and Mikołów Park (ul. Gliwicka DK44, ul. Storczyków + roundabout,
 * ul. Narcyzów, and retail parking connectors).
 */
export const MIKOLOW_AUCHAN_NW_NODES: readonly NWNodeTuple[] = [
  [
    "m_nw_0",
    -1710.4,
    -1368.6,
    "outskirts",
    0
  ],
  [
    "m_nw_1",
    -1626,
    -1293.9,
    "outskirts",
    0
  ],
  [
    "m_nw_2",
    -1554.8,
    -1247.2,
    "outskirts",
    0
  ],
  [
    "m_nw_3",
    -1372.6,
    -709.7,
    "outskirts",
    0
  ],
  [
    "m_nw_4",
    -1411.1,
    -709.8,
    "outskirts",
    0
  ],
  [
    "m_nw_5",
    -1419.9,
    -708.3,
    "outskirts",
    0
  ],
  [
    "m_nw_6",
    -1427.8,
    -706.1,
    "outskirts",
    0
  ],
  [
    "m_nw_7",
    -1450.7,
    -700,
    "outskirts",
    0
  ],
  [
    "m_nw_8",
    -1443.1,
    -1196.1,
    "outskirts",
    0
  ],
  [
    "m_nw_9",
    -1436.1,
    -1208.4,
    "outskirts",
    0
  ],
  [
    "m_nw_10",
    -1356,
    -1425.3,
    "outskirts",
    0
  ],
  [
    "m_nw_11",
    -1347.9,
    -1425.7,
    "outskirts",
    0
  ],
  [
    "m_nw_12",
    -1325.1,
    -1412.6,
    "outskirts",
    0
  ],
  [
    "m_nw_13",
    -1292.4,
    -1387,
    "outskirts",
    0
  ],
  [
    "m_nw_14",
    -1196.7,
    -1274.9,
    "outskirts",
    0
  ],
  [
    "m_nw_15",
    -1178.7,
    -1246.6,
    "outskirts",
    0
  ],
  [
    "m_nw_16",
    -1177.1,
    -1223.5,
    "outskirts",
    0
  ],
  [
    "m_nw_17",
    -1181.3,
    -1207.1,
    "outskirts",
    0
  ],
  [
    "m_nw_18",
    -1239.4,
    -1093,
    "outskirts",
    0
  ],
  [
    "m_nw_19",
    -1779.9,
    -1338,
    "outskirts",
    0
  ],
  [
    "m_nw_20",
    -1739.4,
    -1347,
    "outskirts",
    0
  ],
  [
    "m_nw_21",
    -1713.2,
    -1371.5,
    "outskirts",
    0
  ],
  [
    "m_nw_22",
    -1620.2,
    -1301,
    "outskirts",
    0
  ],
  [
    "m_nw_23",
    -1681.2,
    -1227.7,
    "outskirts",
    0
  ],
  [
    "m_nw_24",
    -1693.5,
    -1187.7,
    "outskirts",
    0
  ],
  [
    "m_nw_25",
    -1698.6,
    -1145.4,
    "outskirts",
    0
  ],
  [
    "m_nw_26",
    -1694.1,
    -1054,
    "outskirts",
    0
  ],
  [
    "m_nw_27",
    -1527.6,
    -1178.1,
    "outskirts",
    0
  ],
  [
    "m_nw_28",
    -1545.4,
    -1182.7,
    "outskirts",
    0
  ],
  [
    "m_nw_29",
    -1572.7,
    -1179.6,
    "outskirts",
    0
  ],
  [
    "m_nw_30",
    -1668.1,
    -1140,
    "outskirts",
    0
  ],
  [
    "m_nw_31",
    -1714.7,
    -1246.7,
    "outskirts",
    0
  ],
  [
    "m_nw_32",
    -1739.8,
    -1269.2,
    "outskirts",
    0
  ],
  [
    "m_nw_33",
    -1775,
    -1258.2,
    "outskirts",
    0
  ],
  [
    "m_nw_34",
    -1280.9,
    -1104.6,
    "outskirts",
    0
  ],
  [
    "m_nw_35",
    -1453.5,
    -1046.3,
    "outskirts",
    0
  ],
  [
    "m_nw_36",
    -1474.2,
    -1098.9,
    "outskirts",
    0
  ],
  [
    "m_nw_37",
    -1449.1,
    -1182.5,
    "outskirts",
    0
  ],
  [
    "m_nw_38",
    -1418.1,
    -1163.9,
    "outskirts",
    0
  ],
  [
    "m_nw_39",
    -1464.4,
    -1154.6,
    "outskirts",
    0
  ],
  [
    "m_nw_40",
    -1447.5,
    -1163.5,
    "outskirts",
    0
  ],
  [
    "m_nw_41",
    -1429.3,
    -1163.9,
    "outskirts",
    0
  ],
  [
    "m_nw_42",
    -1483.8,
    -1198,
    "outskirts",
    0
  ],
  [
    "m_nw_43",
    -1469.3,
    -1177.9,
    "outskirts",
    0
  ],
  [
    "m_nw_44",
    -1468.8,
    -1146.6,
    "outskirts",
    0
  ],
  [
    "m_nw_45",
    -1322.8,
    -710,
    "outskirts",
    0
  ],
  [
    "m_nw_46",
    -1651.7,
    -638.7,
    "outskirts",
    0
  ],
  [
    "m_nw_47",
    -1361.6,
    -700.8,
    "outskirts",
    0
  ],
  [
    "m_nw_48",
    -1480,
    -1070.8,
    "outskirts",
    0
  ],
  [
    "m_nw_49",
    -1507.8,
    -1135.4,
    "outskirts",
    0
  ],
  [
    "m_nw_50",
    -1529.2,
    -1164.7,
    "outskirts",
    0
  ],
  [
    "m_nw_51",
    -1517.7,
    -1180.8,
    "outskirts",
    0
  ],
  [
    "m_nw_52",
    -1507.1,
    -1175.4,
    "outskirts",
    0
  ],
  [
    "m_nw_53",
    -1491.9,
    -1138.8,
    "outskirts",
    0
  ],
  [
    "m_nw_54",
    -1502.9,
    -1217.4,
    "outskirts",
    0
  ],
  [
    "m_nw_55",
    -1480,
    -1203,
    "outskirts",
    0
  ],
  [
    "m_nw_56",
    -1481.6,
    -1120.1,
    "outskirts",
    0
  ],
  [
    "m_nw_57",
    -1657.7,
    -1342.5,
    "outskirts",
    0
  ],
  [
    "m_nw_58",
    -1650.2,
    -1374.3,
    "outskirts",
    0
  ],
  [
    "m_nw_59",
    -1362.2,
    -1435.6,
    "outskirts",
    0
  ],
  [
    "m_nw_60",
    -1408.9,
    -1463.7,
    "outskirts",
    0
  ],
  [
    "m_nw_61",
    -1520.6,
    -1518.1,
    "outskirts",
    0
  ],
  [
    "m_nw_62",
    -1586.2,
    -1545.1,
    "outskirts",
    0
  ],
  [
    "m_nw_63",
    -1759.3,
    -1037.6,
    "outskirts",
    0
  ],
  [
    "m_nw_64",
    -1655.2,
    -1394.1,
    "outskirts",
    0
  ],
  [
    "m_nw_65",
    -1650.5,
    -1492.9,
    "outskirts",
    0
  ],
  [
    "m_nw_66",
    -1641.7,
    -1532.7,
    "outskirts",
    0
  ],
  [
    "m_nw_67",
    -1633,
    -1541,
    "outskirts",
    0
  ],
  [
    "m_nw_68",
    -1611.5,
    -1547.6,
    "outskirts",
    0
  ],
  [
    "m_nw_69",
    -1450.4,
    -1221.2,
    "outskirts",
    0
  ],
  [
    "m_nw_70",
    -1470.7,
    -1212.4,
    "outskirts",
    0
  ],
  [
    "m_nw_71",
    -1443.7,
    -1280.5,
    "outskirts",
    0
  ],
  [
    "m_nw_72",
    -1415.8,
    -1337.7,
    "outskirts",
    0
  ],
  [
    "m_nw_73",
    -1443.4,
    -1226,
    "outskirts",
    0
  ],
  [
    "m_nw_74",
    -1525.5,
    -1614.9,
    "outskirts",
    0
  ],
  [
    "m_nw_75",
    -1502,
    -1595.2,
    "outskirts",
    0
  ],
  [
    "m_nw_76",
    -1356,
    -1522.3,
    "outskirts",
    0
  ],
  [
    "m_nw_77",
    -1154.4,
    -1046.9,
    "outskirts",
    0
  ],
  [
    "m_nw_78",
    -1572.7,
    -1269.1,
    "outskirts",
    0
  ],
  [
    "m_nw_79",
    -1445,
    -1233.6,
    "outskirts",
    0
  ],
  [
    "m_nw_80",
    -1445.9,
    -1240.5,
    "outskirts",
    0
  ],
  [
    "m_nw_81",
    -1648.3,
    -1321.2,
    "outskirts",
    0
  ],
  [
    "m_nw_82",
    -1693.9,
    -1359.8,
    "outskirts",
    0
  ],
  [
    "m_nw_83",
    -1481.2,
    -1218.4,
    "outskirts",
    0
  ],
  [
    "m_nw_84",
    -1436.7,
    -1227.2,
    "outskirts",
    0
  ],
  [
    "m_nw_85",
    -1324.9,
    -1129.6,
    "outskirts",
    0
  ],
  [
    "m_nw_86",
    -1449.1,
    -1261.8,
    "outskirts",
    0
  ],
  [
    "m_nw_87",
    -1522.9,
    -1229.3,
    "outskirts",
    0
  ],
  [
    "m_nw_88",
    -1406.7,
    -1157.6,
    "outskirts",
    0
  ],
  [
    "m_nw_89",
    -1356.4,
    -1129.7,
    "outskirts",
    0
  ],
  [
    "m_nw_90",
    -1322.5,
    -1110.9,
    "outskirts",
    0
  ],
  [
    "m_nw_91",
    -1420.2,
    -722.8,
    "outskirts",
    0
  ],
  [
    "m_nw_92",
    -1421.5,
    -739.2,
    "outskirts",
    0
  ],
  [
    "m_nw_93",
    -1447,
    -871.4,
    "outskirts",
    0
  ],
  [
    "m_nw_94",
    -1450.2,
    -933.7,
    "outskirts",
    0
  ],
  [
    "m_nw_95",
    -1443.5,
    -1006.4,
    "outskirts",
    0
  ],
  [
    "m_nw_96",
    -1408.1,
    -1351.6,
    "outskirts",
    0
  ],
  [
    "m_nw_97",
    -1471.6,
    -689.1,
    "outskirts",
    0
  ],
  [
    "m_nw_98",
    -1649.6,
    -649.9,
    "outskirts",
    0
  ],
  [
    "m_nw_99",
    -1412.9,
    -1352.7,
    "outskirts",
    0
  ],
  [
    "m_nw_100",
    -1417.5,
    -1351,
    "outskirts",
    0
  ],
  [
    "m_nw_101",
    -1420.2,
    -1346.7,
    "outskirts",
    0
  ],
  [
    "m_nw_102",
    -1419.7,
    -1341.4,
    "outskirts",
    0
  ],
  [
    "m_nw_103",
    -1410.5,
    -1337.1,
    "outskirts",
    0
  ],
  [
    "m_nw_104",
    -1406.1,
    -1340.2,
    "outskirts",
    0
  ],
  [
    "m_nw_105",
    -1404.6,
    -1345,
    "outskirts",
    0
  ],
  [
    "m_nw_106",
    -1241.5,
    -1067.1,
    "outskirts",
    0
  ],
  [
    "m_nw_107",
    -1655.8,
    -1331.2,
    "outskirts",
    0
  ],
  [
    "m_nw_p_auchan_n",
    -1385,
    -1105,
    "outskirts",
    0
  ],
  [
    "m_nw_p_auchan_c",
    -1365,
    -965,
    "outskirts",
    0
  ],
  [
    "m_nw_p_auchan_s",
    -1385,
    -840,
    "outskirts",
    0
  ],
  [
    "m_nw_p_leroy_c",
    -1380,
    -1290,
    "outskirts",
    0
  ],
  [
    "m_nw_p_decat_c",
    -1545,
    -1305,
    "outskirts",
    0
  ]
];

export const MIKOLOW_AUCHAN_NW_EDGES: readonly NWEdgeTuple[] = [
  [
    "m_nw_0",
    "m_nw_1",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_1",
    "m_nw_2",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_3",
    "m_nw_4",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_4",
    "m_nw_5",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_6",
    "m_nw_7",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_8",
    "m_nw_9",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_10",
    "m_nw_11",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_11",
    "m_nw_12",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_12",
    "m_nw_13",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_13",
    "m_nw_14",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_14",
    "m_nw_15",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_15",
    "m_nw_16",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_16",
    "m_nw_17",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_17",
    "m_nw_18",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_19",
    "m_nw_20",
    "ul. Kwiatowa",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_20",
    "m_nw_21",
    "ul. Kwiatowa",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_22",
    "m_nw_1",
    "ul. Różana",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_1",
    "m_nw_23",
    "ul. Różana",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_23",
    "m_nw_24",
    "ul. Różana",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_24",
    "m_nw_25",
    "ul. Różana",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_25",
    "m_nw_26",
    "ul. Różana",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_27",
    "m_nw_28",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_28",
    "m_nw_29",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_29",
    "m_nw_30",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_23",
    "m_nw_31",
    "ul. Irysów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_31",
    "m_nw_32",
    "ul. Irysów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_32",
    "m_nw_33",
    "ul. Irysów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_0",
    "m_nw_21",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2
  ],
  [
    "m_1032",
    "m_nw_34",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_35",
    "m_nw_36",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_37",
    "m_nw_38",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_39",
    "m_nw_40",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_40",
    "m_nw_41",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_42",
    "m_nw_43",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_43",
    "m_nw_44",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_45",
    "m_1076",
    "ul. Cieszyńska",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_46",
    "m_nw_47",
    "ul. Cieszyńska",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_48",
    "m_nw_49",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_49",
    "m_nw_50",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_50",
    "m_nw_27",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_27",
    "m_nw_51",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_51",
    "m_nw_52",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_52",
    "m_nw_53",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_54",
    "m_nw_55",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_56",
    "m_nw_44",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_57",
    "m_nw_58",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_10",
    "m_nw_59",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_59",
    "m_nw_60",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_60",
    "m_nw_61",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_61",
    "m_nw_62",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_26",
    "m_nw_63",
    "ul. Astrów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_58",
    "m_nw_64",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_64",
    "m_nw_65",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_65",
    "m_nw_66",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_66",
    "m_nw_67",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_67",
    "m_nw_68",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_68",
    "m_nw_62",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_69",
    "m_nw_70",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_71",
    "m_nw_72",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_73",
    "m_nw_8",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_74",
    "m_nw_75",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_75",
    "m_nw_76",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_62",
    "m_nw_74",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_18",
    "m_nw_77",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_78",
    "m_nw_22",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_37",
    "m_nw_8",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_54",
    "m_nw_42",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_79",
    "m_nw_73",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_80",
    "m_nw_79",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_55",
    "m_nw_37",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_22",
    "m_nw_81",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_81",
    "m_nw_82",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_82",
    "m_nw_0",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_8",
    "m_nw_70",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_83",
    "m_nw_78",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_79",
    "m_nw_69",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_84",
    "m_nw_80",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_85",
    "m_nw_8",
    "ul. Gliwicka",
    "avenue",
    2,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_34",
    "m_nw_85",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_39",
    "m_nw_37",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_80",
    "m_nw_86",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_86",
    "m_nw_71",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_87",
    "m_nw_54",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_2",
    "m_nw_87",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_41",
    "m_nw_88",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_89",
    "m_nw_90",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_88",
    "m_nw_89",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_38",
    "m_nw_88",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_4",
    "m_nw_91",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_92",
    "m_nw_93",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_93",
    "m_nw_94",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_94",
    "m_nw_95",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_95",
    "m_nw_35",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_96",
    "m_nw_10",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5
  ],
  [
    "m_nw_53",
    "m_nw_56",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_36",
    "m_nw_56",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_7",
    "m_nw_97",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_5",
    "m_nw_6",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_91",
    "m_nw_6",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_91",
    "m_nw_92",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_1091",
    "m_nw_3",
    "ul. Cieszyńska",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_3",
    "m_nw_97",
    "ul. Cieszyńska",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_97",
    "m_nw_98",
    "ul. Cieszyńska",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_96",
    "m_nw_99",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_99",
    "m_nw_100",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_100",
    "m_nw_101",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_101",
    "m_nw_102",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_102",
    "m_nw_72",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_72",
    "m_nw_103",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_103",
    "m_nw_104",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_104",
    "m_nw_105",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_105",
    "m_nw_96",
    "Rondo Auchan / Leroy Merlin",
    "street",
    1,
    11.1,
    7.8,
    1.4,
    0,
    1,
    "rb_auchan_leroy",
    [
      -1412.4,
      -1345,
      7.9
    ]
  ],
  [
    "m_nw_9",
    "m_nw_84",
    "ul. Storczyków",
    "street",
    1,
    11.1,
    7.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_70",
    "m_nw_83",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_106",
    "m_1041",
    "ul. Gliwicka",
    "avenue",
    2,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_90",
    "m_nw_106",
    "ul. Gliwicka",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_47",
    "m_nw_45",
    "ul. Cieszyńska",
    "avenue",
    1,
    16.7,
    10.4,
    2,
    0,
    1
  ],
  [
    "m_nw_44",
    "m_nw_39",
    "ul. Narcyzów",
    "street",
    1,
    11.1,
    6.6,
    1.5
  ],
  [
    "m_nw_81",
    "m_nw_107",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_107",
    "m_nw_57",
    "ul. Gliwicka",
    "street",
    1,
    11.1,
    6.6,
    1.5,
    0,
    1
  ],
  [
    "m_nw_38",
    "m_nw_p_auchan_n",
    "Parking Auchan",
    "street",
    1,
    8.3,
    6.8,
    1.2
  ],
  [
    "m_nw_p_auchan_n",
    "m_nw_p_auchan_c",
    "Parking Auchan",
    "street",
    1,
    8.3,
    6.8,
    1.2
  ],
  [
    "m_nw_p_auchan_c",
    "m_nw_p_auchan_s",
    "Parking Auchan",
    "street",
    1,
    8.3,
    6.8,
    1.2
  ],
  [
    "m_nw_35",
    "m_nw_p_auchan_c",
    "Parking Auchan",
    "street",
    1,
    8.3,
    6.4,
    1.2
  ],
  [
    "m_nw_99",
    "m_nw_p_leroy_c",
    "Parking Leroy Merlin",
    "street",
    1,
    8.3,
    6.4,
    1.2
  ],
  [
    "m_nw_99",
    "m_nw_p_decat_c",
    "Parking Decathlon",
    "street",
    1,
    8.3,
    6.4,
    1.2
  ],
  [
    "m_nw_p_decat_c",
    "m_nw_2",
    "Parking Decathlon",
    "street",
    1,
    8.3,
    6.4,
    1.2
  ]
];

export const MIKOLOW_AUCHAN_NW_BUILDINGS: readonly CustomBuildingDef[] = [
  {
    "x": -975.3,
    "z": -1610.7,
    "w": 12,
    "d": 15.5,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -972.6,
        -1605.7
      ],
      [
        -969.9,
        -1606.9
      ],
      [
        -970.3,
        -1621.1
      ],
      [
        -981.9,
        -1620.8
      ],
      [
        -981.8,
        -1613.3
      ],
      [
        -977.6,
        -1613.5
      ],
      [
        -977.3,
        -1606.7
      ],
      [
        -974.5,
        -1605.6
      ]
    ]
  },
  {
    "x": -1491.8,
    "z": -1480.3,
    "w": 16.4,
    "d": 15.7,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1489.1,
        -1480.8
      ],
      [
        -1487.3,
        -1484
      ],
      [
        -1498.5,
        -1490.5
      ],
      [
        -1503.7,
        -1481.5
      ],
      [
        -1492.6,
        -1474.8
      ],
      [
        -1491.1,
        -1477.4
      ],
      [
        -1489,
        -1477.5
      ],
      [
        -1488.5,
        -1480.5
      ]
    ]
  },
  {
    "x": -1471.7,
    "z": -1527.4,
    "w": 18.9,
    "d": 22.6,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1476.2,
        -1539.9
      ],
      [
        -1484.7,
        -1522.4
      ],
      [
        -1474.2,
        -1517.3
      ],
      [
        -1471.5,
        -1522.9
      ],
      [
        -1471.9,
        -1525.1
      ],
      [
        -1465.8,
        -1534.8
      ]
    ]
  },
  {
    "x": -1457.2,
    "z": -1593.1,
    "w": 20.4,
    "d": 15.2,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1461.1,
        -1597.3
      ],
      [
        -1463.3,
        -1598.4
      ],
      [
        -1467.7,
        -1589.4
      ],
      [
        -1461,
        -1586
      ],
      [
        -1459.9,
        -1588.3
      ],
      [
        -1457.3,
        -1586.9
      ],
      [
        -1451.3,
        -1585
      ],
      [
        -1447.3,
        -1593.5
      ],
      [
        -1452.6,
        -1596.1
      ],
      [
        -1455.2,
        -1598.8
      ],
      [
        -1459.7,
        -1600.2
      ]
    ]
  },
  {
    "x": -1521.8,
    "z": -1488.8,
    "w": 21.8,
    "d": 18.2,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1514.3,
        -1493.4
      ],
      [
        -1526.2,
        -1500.6
      ],
      [
        -1531.5,
        -1491.8
      ],
      [
        -1527.3,
        -1489.2
      ],
      [
        -1527.6,
        -1487
      ],
      [
        -1524.4,
        -1486
      ],
      [
        -1519.4,
        -1484.4
      ],
      [
        -1513.7,
        -1482.4
      ],
      [
        -1509.7,
        -1489.4
      ],
      [
        -1514.8,
        -1492.3
      ]
    ]
  },
  {
    "x": -1615.5,
    "z": -1527.2,
    "w": 17.2,
    "d": 15.4,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1609.6,
        -1530.8
      ],
      [
        -1618.2,
        -1535.7
      ],
      [
        -1621.4,
        -1530.9
      ],
      [
        -1621.1,
        -1528.8
      ],
      [
        -1618.3,
        -1527.3
      ],
      [
        -1619.3,
        -1524.1
      ],
      [
        -1614.6,
        -1521.7
      ],
      [
        -1613.4,
        -1523
      ],
      [
        -1608,
        -1520.3
      ],
      [
        -1604.2,
        -1528.2
      ]
    ]
  },
  {
    "x": -1562.1,
    "z": -1508.2,
    "w": 26.3,
    "d": 23.1,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1559.7,
        -1499.8
      ],
      [
        -1555.3,
        -1496.4
      ],
      [
        -1549.1,
        -1507
      ],
      [
        -1552.9,
        -1509.4
      ],
      [
        -1557.2,
        -1512.8
      ],
      [
        -1561.7,
        -1514.7
      ],
      [
        -1562.3,
        -1513.3
      ],
      [
        -1564.6,
        -1514.8
      ],
      [
        -1569.7,
        -1519.5
      ],
      [
        -1575.4,
        -1509.9
      ],
      [
        -1569.7,
        -1506.5
      ],
      [
        -1568.7,
        -1508.3
      ],
      [
        -1566.2,
        -1506.9
      ],
      [
        -1568,
        -1504
      ],
      [
        -1563.1,
        -1501.8
      ]
    ]
  },
  {
    "x": -1429.8,
    "z": -1578.6,
    "w": 17.7,
    "d": 20.6,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1428.9,
        -1571
      ],
      [
        -1425.4,
        -1567.6
      ],
      [
        -1422.1,
        -1574.3
      ],
      [
        -1421.2,
        -1578.5
      ],
      [
        -1428.7,
        -1582.8
      ],
      [
        -1427.6,
        -1585.1
      ],
      [
        -1433.2,
        -1587
      ],
      [
        -1434.8,
        -1583.9
      ],
      [
        -1437.8,
        -1580.3
      ],
      [
        -1435.7,
        -1579.2
      ],
      [
        -1437.6,
        -1575.2
      ],
      [
        -1433.5,
        -1573
      ],
      [
        -1431.7,
        -1573.3
      ]
    ]
  },
  {
    "x": -953.1,
    "z": -1501.9,
    "w": 8.6,
    "d": 6,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -957.1,
        -1498.9
      ],
      [
        -948.7,
        -1499.5
      ],
      [
        -949.2,
        -1504.9
      ],
      [
        -957.3,
        -1504.2
      ]
    ]
  },
  {
    "x": -964.3,
    "z": -1473.9,
    "w": 9.1,
    "d": 6.3,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -968.9,
        -1476.4
      ],
      [
        -968.5,
        -1470.7
      ],
      [
        -959.8,
        -1471.3
      ],
      [
        -960.2,
        -1477
      ]
    ]
  },
  {
    "x": -1622,
    "z": -1506.2,
    "w": 11.7,
    "d": 14,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1621.6,
        -1499.2
      ],
      [
        -1616.2,
        -1510
      ],
      [
        -1622.4,
        -1513.2
      ],
      [
        -1627.9,
        -1502.4
      ]
    ]
  },
  {
    "x": -1653.1,
    "z": -1531.6,
    "w": 10.9,
    "d": 10.6,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1648.6,
        -1533.5
      ],
      [
        -1657.3,
        -1535.6
      ],
      [
        -1659.5,
        -1527.3
      ],
      [
        -1650.8,
        -1525
      ]
    ]
  },
  {
    "x": -953,
    "z": -1495.8,
    "w": 9.9,
    "d": 10.2,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -956.5,
        -1489.4
      ],
      [
        -947.2,
        -1490.1
      ],
      [
        -947.9,
        -1499.6
      ],
      [
        -957,
        -1498.4
      ],
      [
        -956.8,
        -1494.9
      ]
    ]
  },
  {
    "x": -1661.6,
    "z": -1511.4,
    "w": 11.4,
    "d": 10.8,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1654,
        -1515.2
      ],
      [
        -1663.3,
        -1517.5
      ],
      [
        -1665.4,
        -1508.9
      ],
      [
        -1655.9,
        -1506.7
      ]
    ]
  },
  {
    "x": -1719.6,
    "z": -1469.5,
    "w": 10.2,
    "d": 12.2,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1721.1,
        -1475
      ],
      [
        -1726.2,
        -1472.5
      ],
      [
        -1721.3,
        -1462.8
      ],
      [
        -1717.1,
        -1464.9
      ],
      [
        -1718.7,
        -1468
      ],
      [
        -1716,
        -1469.4
      ],
      [
        -1717.4,
        -1472.1
      ],
      [
        -1719.2,
        -1471.2
      ]
    ]
  },
  {
    "x": -1734.2,
    "z": -1317.6,
    "w": 14.7,
    "d": 14.3,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1731.2,
        -1316.3
      ],
      [
        -1728.6,
        -1318
      ],
      [
        -1733.7,
        -1326.1
      ],
      [
        -1743.3,
        -1320.1
      ],
      [
        -1737.9,
        -1311.8
      ],
      [
        -1731,
        -1316.1
      ]
    ]
  },
  {
    "x": -1613.3,
    "z": -1189.3,
    "w": 21.1,
    "d": 19.9,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1602.1,
        -1195.9
      ],
      [
        -1616.4,
        -1203.1
      ],
      [
        -1623.2,
        -1189.2
      ],
      [
        -1618.4,
        -1186.8
      ],
      [
        -1615.6,
        -1183.8
      ],
      [
        -1614.8,
        -1185.1
      ],
      [
        -1611.1,
        -1183.2
      ],
      [
        -1607.3,
        -1190.7
      ],
      [
        -1605.2,
        -1189.7
      ]
    ]
  },
  {
    "x": -1680.5,
    "z": -1116.8,
    "w": 16.5,
    "d": 12.2,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1676.2,
        -1112.7
      ],
      [
        -1671.4,
        -1112.5
      ],
      [
        -1672.9,
        -1121.4
      ],
      [
        -1679.8,
        -1120.4
      ],
      [
        -1680.3,
        -1123.4
      ],
      [
        -1687.9,
        -1122.4
      ],
      [
        -1686.5,
        -1111.2
      ]
    ]
  },
  {
    "x": -1693.9,
    "z": -979,
    "w": 11.8,
    "d": 21.2,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1694.3,
        -977.1
      ],
      [
        -1687.1,
        -978.2
      ],
      [
        -1689,
        -990.1
      ],
      [
        -1698.9,
        -988.6
      ],
      [
        -1695.8,
        -968.9
      ],
      [
        -1694.2,
        -969.1
      ],
      [
        -1694.5,
        -970.9
      ]
    ]
  },
  {
    "x": -1514.1,
    "z": -1443.2,
    "w": 16.3,
    "d": 15.7,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1510.3,
        -1446.3
      ],
      [
        -1521,
        -1452.9
      ],
      [
        -1526.6,
        -1443.7
      ],
      [
        -1515.8,
        -1437.2
      ],
      [
        -1513.4,
        -1441
      ],
      [
        -1510.6,
        -1442.6
      ],
      [
        -1511.4,
        -1444.3
      ]
    ]
  },
  {
    "x": -1298.7,
    "z": -834.4,
    "w": 16.1,
    "d": 10.8,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1305.5,
        -835.8
      ],
      [
        -1306.9,
        -835
      ],
      [
        -1302.7,
        -833.6
      ],
      [
        -1295.8,
        -832
      ],
      [
        -1291.8,
        -829.9
      ],
      [
        -1292.5,
        -831.3
      ],
      [
        -1290.8,
        -836.1
      ],
      [
        -1303.7,
        -840.7
      ],
      [
        -1304.6,
        -838.3
      ]
    ]
  },
  {
    "x": -1287.2,
    "z": -1003.2,
    "w": 11,
    "d": 16,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1286.1,
        -995.6
      ],
      [
        -1281.4,
        -1008.5
      ],
      [
        -1286.3,
        -1010
      ],
      [
        -1286.9,
        -1011.6
      ],
      [
        -1292.4,
        -996.5
      ],
      [
        -1290.9,
        -997.4
      ],
      [
        -1288.6,
        -996.6
      ]
    ]
  },
  {
    "x": -1330.8,
    "z": -881.8,
    "w": 11,
    "d": 15.9,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1334.5,
        -875.5
      ],
      [
        -1329.3,
        -873.7
      ],
      [
        -1324.8,
        -886.6
      ],
      [
        -1329.8,
        -888.4
      ],
      [
        -1335.8,
        -874.6
      ]
    ]
  },
  {
    "x": -1661.2,
    "z": -979.5,
    "w": 11.1,
    "d": 13.9,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1659.5,
        -975
      ],
      [
        -1655.5,
        -977.1
      ],
      [
        -1657.8,
        -988.5
      ],
      [
        -1666.6,
        -986.9
      ],
      [
        -1664.2,
        -975.3
      ],
      [
        -1660.7,
        -974.7
      ]
    ]
  },
  {
    "x": -1461.7,
    "z": -1460.2,
    "w": 21.9,
    "d": 18.4,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1454.3,
        -1464.8
      ],
      [
        -1466.2,
        -1472
      ],
      [
        -1471.5,
        -1463.1
      ],
      [
        -1467.3,
        -1460.6
      ],
      [
        -1467.7,
        -1458.6
      ],
      [
        -1464.4,
        -1457.3
      ],
      [
        -1459.5,
        -1455.9
      ],
      [
        -1453.6,
        -1453.6
      ],
      [
        -1449.6,
        -1460.6
      ],
      [
        -1454.8,
        -1463.7
      ]
    ]
  },
  {
    "x": -1610.9,
    "z": -1131.2,
    "w": 16.7,
    "d": 13.2,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1608.9,
        -1126.9
      ],
      [
        -1602.4,
        -1127.7
      ],
      [
        -1604.2,
        -1139.5
      ],
      [
        -1613.6,
        -1137.6
      ],
      [
        -1612.8,
        -1133
      ],
      [
        -1619.1,
        -1131.7
      ],
      [
        -1618.3,
        -1127.5
      ],
      [
        -1611.5,
        -1128.9
      ],
      [
        -1610.8,
        -1126.3
      ],
      [
        -1609,
        -1126.8
      ]
    ]
  },
  {
    "x": -1710,
    "z": -1160.4,
    "w": 11.2,
    "d": 16,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1708.1,
        -1166.4
      ],
      [
        -1714.2,
        -1167.9
      ],
      [
        -1714.5,
        -1163
      ],
      [
        -1715.8,
        -1162.2
      ],
      [
        -1716.2,
        -1156
      ],
      [
        -1715.3,
        -1152.4
      ],
      [
        -1707.2,
        -1151.9
      ],
      [
        -1706.9,
        -1155.3
      ],
      [
        -1705.5,
        -1160
      ],
      [
        -1706,
        -1162
      ],
      [
        -1705,
        -1166.3
      ]
    ]
  },
  {
    "x": -1637.3,
    "z": -988.7,
    "w": 17.4,
    "d": 13.2,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1633.8,
        -985.6
      ],
      [
        -1632.9,
        -981.7
      ],
      [
        -1626.4,
        -983
      ],
      [
        -1628.7,
        -994.9
      ],
      [
        -1634.6,
        -993.7
      ],
      [
        -1643.5,
        -992
      ],
      [
        -1643.4,
        -986.6
      ],
      [
        -1641.8,
        -982.9
      ],
      [
        -1635.4,
        -985
      ]
    ]
  },
  {
    "x": -1275.5,
    "z": -1309.3,
    "w": 9.3,
    "d": 9.3,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1273.5,
        -1305.1
      ],
      [
        -1270.8,
        -1309.6
      ],
      [
        -1274.1,
        -1313.7
      ],
      [
        -1279.1,
        -1312.2
      ],
      [
        -1279.5,
        -1307
      ],
      [
        -1274.8,
        -1304.7
      ]
    ]
  },
  {
    "x": -1439.8,
    "z": -1445.3,
    "w": 17,
    "d": 16.5,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1446.2,
        -1445.3
      ],
      [
        -1446.7,
        -1443.2
      ],
      [
        -1444.1,
        -1441.7
      ],
      [
        -1444.8,
        -1440.3
      ],
      [
        -1439.7,
        -1437.3
      ],
      [
        -1439,
        -1438.7
      ],
      [
        -1436.3,
        -1437.2
      ],
      [
        -1429.7,
        -1446.8
      ],
      [
        -1436.7,
        -1451.5
      ],
      [
        -1438.5,
        -1453.7
      ],
      [
        -1440.7,
        -1453.4
      ],
      [
        -1444.7,
        -1447.8
      ]
    ]
  },
  {
    "x": -1733.6,
    "z": -1286.8,
    "w": 13.7,
    "d": 14,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1735.2,
        -1279.8
      ],
      [
        -1726.7,
        -1285.2
      ],
      [
        -1732,
        -1293.8
      ],
      [
        -1740.4,
        -1288.5
      ]
    ]
  },
  {
    "x": -1720.7,
    "z": -1323.5,
    "w": 8.3,
    "d": 10,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1716.6,
        -1320.7
      ],
      [
        -1720.8,
        -1328.5
      ],
      [
        -1724.9,
        -1326.3
      ],
      [
        -1720.6,
        -1318.5
      ]
    ]
  },
  {
    "x": -1699.8,
    "z": -1257.3,
    "w": 10.9,
    "d": 12.3,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1694.3,
        -1260.1
      ],
      [
        -1700.1,
        -1263.4
      ],
      [
        -1705.2,
        -1254.4
      ],
      [
        -1699.4,
        -1251.1
      ]
    ]
  },
  {
    "x": -1389.6,
    "z": -1421.4,
    "w": 16.4,
    "d": 15,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1386,
        -1413.9
      ],
      [
        -1381.4,
        -1421.6
      ],
      [
        -1393.1,
        -1428.9
      ],
      [
        -1397.8,
        -1421.3
      ]
    ]
  },
  {
    "x": -1431.4,
    "z": -1426.1,
    "w": 10.3,
    "d": 11,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1426.3,
        -1428.1
      ],
      [
        -1432,
        -1431.6
      ],
      [
        -1436.6,
        -1423.9
      ],
      [
        -1430.8,
        -1420.6
      ]
    ]
  },
  {
    "x": -1486.5,
    "z": -1299.3,
    "w": 10,
    "d": 8.1,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1481.5,
        -1299.2
      ],
      [
        -1489.3,
        -1303.3
      ],
      [
        -1491.5,
        -1299.4
      ],
      [
        -1483.7,
        -1295.2
      ]
    ]
  },
  {
    "x": -1006,
    "z": -1272.4,
    "w": 13,
    "d": 7.6,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -999.5,
        -1275
      ],
      [
        -1011.8,
        -1276.2
      ],
      [
        -1012.5,
        -1269.9
      ],
      [
        -1000.2,
        -1268.6
      ]
    ]
  },
  {
    "x": -1709.8,
    "z": -1222.8,
    "w": 7,
    "d": 8.9,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1707.2,
        -1218.4
      ],
      [
        -1706.3,
        -1226.4
      ],
      [
        -1712.4,
        -1227.3
      ],
      [
        -1713.3,
        -1219.1
      ]
    ]
  },
  {
    "x": -1726.7,
    "z": -1196,
    "w": 11.8,
    "d": 6.6,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1721.4,
        -1192.7
      ],
      [
        -1720.8,
        -1198
      ],
      [
        -1732.1,
        -1199.3
      ],
      [
        -1732.6,
        -1193.8
      ]
    ]
  },
  {
    "x": -1729.5,
    "z": -1233.1,
    "w": 13.1,
    "d": 11,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1723,
        -1237.9
      ],
      [
        -1735.4,
        -1238.6
      ],
      [
        -1736.1,
        -1228.3
      ],
      [
        -1723.7,
        -1227.6
      ]
    ]
  },
  {
    "x": -1563.2,
    "z": -1146.1,
    "w": 9.4,
    "d": 11.8,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1566.1,
        -1140.2
      ],
      [
        -1558.5,
        -1141.6
      ],
      [
        -1560.3,
        -1152
      ],
      [
        -1567.9,
        -1150.6
      ]
    ]
  },
  {
    "x": -1607.4,
    "z": -1084.6,
    "w": 16.6,
    "d": 16.2,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1613.7,
        -1076.5
      ],
      [
        -1599,
        -1078.9
      ],
      [
        -1601.3,
        -1092.7
      ],
      [
        -1615.6,
        -1090.3
      ]
    ]
  },
  {
    "x": -1606.9,
    "z": -1143.5,
    "w": 5.7,
    "d": 9.7,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1608.1,
        -1138.7
      ],
      [
        -1604.3,
        -1139.6
      ],
      [
        -1605.4,
        -1148.4
      ],
      [
        -1610,
        -1147.4
      ]
    ]
  },
  {
    "x": -1590.3,
    "z": -1206.2,
    "w": 13.7,
    "d": 13.3,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1587.7,
        -1199.6
      ],
      [
        -1583.4,
        -1208
      ],
      [
        -1592.9,
        -1212.9
      ],
      [
        -1597.1,
        -1204.4
      ]
    ]
  },
  {
    "x": -1588.3,
    "z": -1108.8,
    "w": 11.4,
    "d": 13,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1592.2,
        -1102.3
      ],
      [
        -1582.6,
        -1104
      ],
      [
        -1584.5,
        -1115.3
      ],
      [
        -1594,
        -1113.7
      ]
    ]
  },
  {
    "x": -1566.7,
    "z": -1191.7,
    "w": 11.7,
    "d": 12.1,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1572.5,
        -1193.2
      ],
      [
        -1567.1,
        -1185.6
      ],
      [
        -1560.8,
        -1190.1
      ],
      [
        -1566.4,
        -1197.7
      ]
    ]
  },
  {
    "x": -1615.3,
    "z": -1116.2,
    "w": 10.6,
    "d": 11.1,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1619.3,
        -1110.6
      ],
      [
        -1610,
        -1112
      ],
      [
        -1611.3,
        -1121.7
      ],
      [
        -1620.6,
        -1120.4
      ]
    ]
  },
  {
    "x": -1170.4,
    "z": -1134.9,
    "w": 15.4,
    "d": 20,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1162.7,
        -1141.4
      ],
      [
        -1171.5,
        -1144.9
      ],
      [
        -1178.1,
        -1128.4
      ],
      [
        -1169.3,
        -1124.9
      ]
    ]
  },
  {
    "x": -1183.6,
    "z": -1133.4,
    "w": 13.4,
    "d": 10.3,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1179.2,
        -1128.2
      ],
      [
        -1176.9,
        -1133.9
      ],
      [
        -1188,
        -1138.5
      ],
      [
        -1190.3,
        -1132.8
      ]
    ]
  },
  {
    "x": -1179.5,
    "z": -1142.8,
    "w": 14.6,
    "d": 13.4,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1175.8,
        -1136.1
      ],
      [
        -1172.2,
        -1144.9
      ],
      [
        -1183.1,
        -1149.5
      ],
      [
        -1186.8,
        -1140.9
      ]
    ]
  },
  {
    "x": -1210.8,
    "z": -1105,
    "w": 9.4,
    "d": 11.2,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1206.1,
        -1108.2
      ],
      [
        -1211.3,
        -1110.7
      ],
      [
        -1215.5,
        -1101.8
      ],
      [
        -1210.3,
        -1099.5
      ]
    ]
  },
  {
    "x": -1025.4,
    "z": -1198.2,
    "w": 10.8,
    "d": 7,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1021.3,
        -1194.7
      ],
      [
        -1020,
        -1198.5
      ],
      [
        -1029.6,
        -1201.7
      ],
      [
        -1030.8,
        -1197.9
      ]
    ]
  },
  {
    "x": -1174.2,
    "z": -705.9,
    "w": 24.9,
    "d": 10.1,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1186.6,
        -705
      ],
      [
        -1185.6,
        -700.9
      ],
      [
        -1161.7,
        -706.8
      ],
      [
        -1162.9,
        -711
      ]
    ]
  },
  {
    "x": -1483.3,
    "z": -1013.4,
    "w": 12.8,
    "d": 10.1,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1489.7,
        -1015.8
      ],
      [
        -1487.9,
        -1008.4
      ],
      [
        -1476.9,
        -1011
      ],
      [
        -1478.8,
        -1018.5
      ]
    ]
  },
  {
    "x": -1476,
    "z": -971.7,
    "w": 10,
    "d": 8.1,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1479.7,
        -967.6
      ],
      [
        -1471,
        -969.5
      ],
      [
        -1472.3,
        -975.7
      ],
      [
        -1481,
        -973.9
      ]
    ]
  },
  {
    "x": -1489.4,
    "z": -966.4,
    "w": 10,
    "d": 11,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1492.4,
        -960.9
      ],
      [
        -1484.4,
        -962.5
      ],
      [
        -1486.3,
        -971.9
      ],
      [
        -1494.4,
        -970.2
      ]
    ]
  },
  {
    "x": -1690.3,
    "z": -974.6,
    "w": 8.1,
    "d": 7.2,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1694.3,
        -977.1
      ],
      [
        -1693.4,
        -971
      ],
      [
        -1686.2,
        -972.2
      ],
      [
        -1687.1,
        -978.2
      ]
    ]
  },
  {
    "x": -1678.5,
    "z": -1019.9,
    "w": 8.1,
    "d": 13,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1680.5,
        -1013.4
      ],
      [
        -1674.4,
        -1014.5
      ],
      [
        -1676.5,
        -1026.4
      ],
      [
        -1682.5,
        -1025.3
      ]
    ]
  },
  {
    "x": -1687.6,
    "z": -949.7,
    "w": 11.7,
    "d": 6.5,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1693.5,
        -951
      ],
      [
        -1692.6,
        -946.5
      ],
      [
        -1681.8,
        -948.3
      ],
      [
        -1682.6,
        -953
      ]
    ]
  },
  {
    "x": -1662.8,
    "z": -990.9,
    "w": 8,
    "d": 7.7,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1666.8,
        -993.5
      ],
      [
        -1665.5,
        -987.1
      ],
      [
        -1658.8,
        -988.3
      ],
      [
        -1660.1,
        -994.8
      ]
    ]
  },
  {
    "x": -1518.5,
    "z": -1052,
    "w": 7.8,
    "d": 9,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1522.4,
        -1055.1
      ],
      [
        -1520.6,
        -1047.5
      ],
      [
        -1514.6,
        -1048.9
      ],
      [
        -1516.4,
        -1056.5
      ]
    ]
  },
  {
    "x": -1509.4,
    "z": -924.1,
    "w": 6.6,
    "d": 9.8,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1512.7,
        -928.6
      ],
      [
        -1512.1,
        -919.2
      ],
      [
        -1506.1,
        -919.5
      ],
      [
        -1506.8,
        -929
      ]
    ]
  },
  {
    "x": -1752.2,
    "z": -1059.5,
    "w": 8.7,
    "d": 12.8,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1753.9,
        -1053.1
      ],
      [
        -1747.8,
        -1054.6
      ],
      [
        -1750.4,
        -1065.9
      ],
      [
        -1756.5,
        -1064.5
      ]
    ]
  },
  {
    "x": -1746,
    "z": -1061,
    "w": 8.9,
    "d": 12.8,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1747.8,
        -1054.6
      ],
      [
        -1741.5,
        -1056.1
      ],
      [
        -1744.2,
        -1067.4
      ],
      [
        -1750.4,
        -1065.9
      ]
    ]
  },
  {
    "x": -988.7,
    "z": -1278,
    "w": 13.3,
    "d": 10.8,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -981.9,
        -1273
      ],
      [
        -980.8,
        -1282.2
      ],
      [
        -993,
        -1283.8
      ],
      [
        -994.1,
        -1274.5
      ]
    ]
  },
  {
    "x": -986.3,
    "z": -1377.5,
    "w": 12.8,
    "d": 14.6,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -992.7,
        -1381.1
      ],
      [
        -989.8,
        -1368.9
      ],
      [
        -979.9,
        -1371.4
      ],
      [
        -983,
        -1383.5
      ],
      [
        -986.2,
        -1382.7
      ]
    ]
  },
  {
    "x": -1638.6,
    "z": -1450.8,
    "w": 10.2,
    "d": 10.8,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1634.7,
        -1445.8
      ],
      [
        -1634.5,
        -1456.4
      ],
      [
        -1644.5,
        -1456.6
      ],
      [
        -1644.7,
        -1445.9
      ]
    ]
  },
  {
    "x": -1490.9,
    "z": -1283.3,
    "w": 11.3,
    "d": 11.6,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1495.9,
        -1280.5
      ],
      [
        -1488.5,
        -1276.9
      ],
      [
        -1484.6,
        -1284.8
      ],
      [
        -1492,
        -1288.5
      ],
      [
        -1493.3,
        -1285.8
      ]
    ]
  },
  {
    "x": -1711,
    "z": -1262,
    "w": 11,
    "d": 12.4,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1707.4,
        -1261.4
      ],
      [
        -1706.5,
        -1264.6
      ],
      [
        -1712.8,
        -1268.2
      ],
      [
        -1717.5,
        -1259.9
      ],
      [
        -1710.6,
        -1255.8
      ]
    ]
  },
  {
    "x": -1727.9,
    "z": -1089.2,
    "w": 11,
    "d": 7,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1733.2,
        -1089.8
      ],
      [
        -1731.9,
        -1086.2
      ],
      [
        -1722.2,
        -1089.6
      ],
      [
        -1723.5,
        -1093.2
      ]
    ]
  },
  {
    "x": -1543.2,
    "z": -1114.5,
    "w": 7.3,
    "d": 8.3,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1546.6,
        -1116.9
      ],
      [
        -1545.4,
        -1109.6
      ],
      [
        -1539.3,
        -1110.8
      ],
      [
        -1540.6,
        -1117.9
      ],
      [
        -1543.9,
        -1117.3
      ]
    ]
  },
  {
    "x": -1537.3,
    "z": -1106,
    "w": 17.4,
    "d": 15.3,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1543.3,
        -1097.2
      ],
      [
        -1528,
        -1100.1
      ],
      [
        -1530.3,
        -1112.5
      ],
      [
        -1545.4,
        -1109.6
      ]
    ]
  },
  {
    "x": -1623.6,
    "z": -1138.8,
    "w": 7.2,
    "d": 10.8,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1626.8,
        -1144.5
      ],
      [
        -1624.8,
        -1134.5
      ],
      [
        -1619.6,
        -1135.4
      ],
      [
        -1621.8,
        -1145.3
      ]
    ]
  },
  {
    "x": -1540.8,
    "z": -702.1,
    "w": 8.1,
    "d": 10.1,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1542.8,
        -697.6
      ],
      [
        -1536.1,
        -698.5
      ],
      [
        -1537.5,
        -707.7
      ],
      [
        -1544.2,
        -706.5
      ],
      [
        -1543.2,
        -700.2
      ]
    ]
  },
  {
    "x": -1527.7,
    "z": -701.3,
    "w": 15,
    "d": 14.5,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1536.5,
        -705.9
      ],
      [
        -1533.6,
        -694.2
      ],
      [
        -1521.5,
        -697
      ],
      [
        -1524.3,
        -708.7
      ]
    ]
  },
  {
    "x": -1738.7,
    "z": -1449.5,
    "w": 14.9,
    "d": 14.9,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1732.4,
        -1448.1
      ],
      [
        -1740.2,
        -1455.8
      ],
      [
        -1747.3,
        -1448.6
      ],
      [
        -1739.7,
        -1440.9
      ]
    ]
  },
  {
    "x": -1718.9,
    "z": -1116.2,
    "w": 8.2,
    "d": 5,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1722.2,
        -1117.9
      ],
      [
        -1722.1,
        -1112.9
      ],
      [
        -1714,
        -1113
      ],
      [
        -1714.2,
        -1117.9
      ],
      [
        -1718.7,
        -1117.9
      ]
    ]
  },
  {
    "x": -1724.5,
    "z": -1085.4,
    "w": 8.6,
    "d": 7.7,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1728.9,
        -1087.3
      ],
      [
        -1727,
        -1081.9
      ],
      [
        -1720.3,
        -1084.2
      ],
      [
        -1722.2,
        -1089.6
      ]
    ]
  },
  {
    "x": -1729,
    "z": -1129.6,
    "w": 9.8,
    "d": 6.6,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1724.1,
        -1132.8
      ],
      [
        -1733.4,
        -1133.5
      ],
      [
        -1733.9,
        -1127.3
      ],
      [
        -1729.3,
        -1126.9
      ],
      [
        -1729.1,
        -1128.7
      ],
      [
        -1724.5,
        -1128.2
      ]
    ]
  },
  {
    "x": -1589.8,
    "z": -1229.8,
    "w": 13.3,
    "d": 14.6,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1587.9,
        -1228.2
      ],
      [
        -1585,
        -1233
      ],
      [
        -1593,
        -1237.8
      ],
      [
        -1598.3,
        -1229.2
      ],
      [
        -1588.6,
        -1223.2
      ],
      [
        -1586.1,
        -1227.2
      ]
    ]
  },
  {
    "x": -1578.8,
    "z": -1155.1,
    "w": 13,
    "d": 13.9,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1583.5,
        -1160.5
      ],
      [
        -1581.3,
        -1148.3
      ],
      [
        -1570.5,
        -1150.1
      ],
      [
        -1572.9,
        -1162.2
      ]
    ]
  },
  {
    "x": -1633.8,
    "z": -1087.2,
    "w": 12.8,
    "d": 12.4,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1640.3,
        -1091
      ],
      [
        -1638.5,
        -1079.4
      ],
      [
        -1627.5,
        -1081.1
      ],
      [
        -1629,
        -1090.2
      ],
      [
        -1633.4,
        -1089.4
      ],
      [
        -1633.9,
        -1091.8
      ]
    ]
  },
  {
    "x": -1002.3,
    "z": -1211.7,
    "w": 13.7,
    "d": 13.4,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1005,
        -1219.9
      ],
      [
        -1008.5,
        -1210.5
      ],
      [
        -998.4,
        -1206.5
      ],
      [
        -994.8,
        -1216
      ]
    ]
  },
  {
    "x": -992,
    "z": -1237.5,
    "w": 13.7,
    "d": 15.8,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -990.5,
        -1239.8
      ],
      [
        -989.5,
        -1242
      ],
      [
        -995.6,
        -1244.3
      ],
      [
        -1000,
        -1232.3
      ],
      [
        -989.9,
        -1228.5
      ],
      [
        -986.3,
        -1238.1
      ]
    ]
  },
  {
    "x": -1186.9,
    "z": -1095,
    "w": 15.7,
    "d": 15.1,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1180.8,
        -1098.6
      ],
      [
        -1191.9,
        -1103.3
      ],
      [
        -1196.5,
        -1093.3
      ],
      [
        -1185.5,
        -1088.2
      ],
      [
        -1182.8,
        -1094.4
      ]
    ]
  },
  {
    "x": -1674.4,
    "z": -946.3,
    "w": 10,
    "d": 6.7,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1679.5,
        -948.1
      ],
      [
        -1678.4,
        -942.4
      ],
      [
        -1669.5,
        -944.1
      ],
      [
        -1670.1,
        -947.4
      ],
      [
        -1674.3,
        -946.6
      ],
      [
        -1674.8,
        -949.1
      ]
    ]
  },
  {
    "x": -1521,
    "z": -945.4,
    "w": 9.7,
    "d": 9.8,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1524.1,
        -940.5
      ],
      [
        -1514.6,
        -940.8
      ],
      [
        -1514.8,
        -950.3
      ],
      [
        -1524.3,
        -950
      ],
      [
        -1524.2,
        -943.4
      ]
    ]
  },
  {
    "x": -1708.6,
    "z": -1124.2,
    "w": 10.4,
    "d": 10,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1704.6,
        -1124.3
      ],
      [
        -1704,
        -1129.6
      ],
      [
        -1714.4,
        -1129.4
      ],
      [
        -1714.2,
        -1119.6
      ],
      [
        -1704.5,
        -1119.8
      ]
    ]
  },
  {
    "x": -1716.5,
    "z": -1176.1,
    "w": 14.6,
    "d": 7.8,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1719.2,
        -1177.3
      ],
      [
        -1719,
        -1179.4
      ],
      [
        -1721.7,
        -1179.4
      ],
      [
        -1721.9,
        -1172.6
      ],
      [
        -1707.7,
        -1171.6
      ],
      [
        -1707.3,
        -1175.6
      ],
      [
        -1718.5,
        -1176.5
      ]
    ]
  },
  {
    "x": -1540,
    "z": -1123.1,
    "w": 13.8,
    "d": 8.4,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1545.6,
        -1125.9
      ],
      [
        -1544.4,
        -1119.3
      ],
      [
        -1531.8,
        -1121.5
      ],
      [
        -1532.6,
        -1125.6
      ],
      [
        -1535.7,
        -1127.7
      ]
    ]
  },
  {
    "x": -1527.6,
    "z": -1108.3,
    "w": 8.9,
    "d": 16.5,
    "h": 3.1,
    "color": 15590612,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1530.4,
        -1112.7
      ],
      [
        -1527.9,
        -1100
      ],
      [
        -1521.7,
        -1101
      ],
      [
        -1524.4,
        -1116.5
      ],
      [
        -1530.6,
        -1115.5
      ]
    ]
  },
  {
    "x": -1618.1,
    "z": -1133.6,
    "w": 12,
    "d": 6.1,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1624.1,
        -1130.6
      ],
      [
        -1612.8,
        -1133.1
      ],
      [
        -1613.4,
        -1136.7
      ],
      [
        -1624.8,
        -1134.5
      ]
    ]
  },
  {
    "x": -987.2,
    "z": -1254.7,
    "w": 10.6,
    "d": 10.9,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -982.3,
        -1258.5
      ],
      [
        -990.3,
        -1260.9
      ],
      [
        -992.9,
        -1252.1
      ],
      [
        -984.8,
        -1250.2
      ],
      [
        -983.6,
        -1254.4
      ]
    ]
  },
  {
    "x": -1758.9,
    "z": -1284.7,
    "w": 15.3,
    "d": 16.9,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1754.5,
        -1287.3
      ],
      [
        -1757.4,
        -1293.4
      ],
      [
        -1766.7,
        -1286.7
      ],
      [
        -1762.9,
        -1281.6
      ],
      [
        -1760.8,
        -1276.5
      ],
      [
        -1751.4,
        -1283.3
      ]
    ]
  },
  {
    "x": -1019.4,
    "z": -1369.1,
    "w": 13.9,
    "d": 12.1,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1021,
        -1366.9
      ],
      [
        -1018.1,
        -1363.6
      ],
      [
        -1013,
        -1368.3
      ],
      [
        -1019.9,
        -1375.7
      ],
      [
        -1026.9,
        -1369
      ],
      [
        -1023.2,
        -1364.9
      ]
    ]
  },
  {
    "x": -1708.7,
    "z": -1184.7,
    "w": 11.9,
    "d": 13.3,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1713.1,
        -1184.5
      ],
      [
        -1711.5,
        -1183.7
      ],
      [
        -1712.4,
        -1181.6
      ],
      [
        -1708.9,
        -1180.2
      ],
      [
        -1708.2,
        -1182.7
      ],
      [
        -1704.6,
        -1181.2
      ],
      [
        -1701.2,
        -1190.2
      ],
      [
        -1709.7,
        -1193.5
      ]
    ]
  },
  {
    "x": -1615,
    "z": -1142.7,
    "w": 14.6,
    "d": 16.2,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1613.6,
        -1137.6
      ],
      [
        -1608.1,
        -1138.7
      ],
      [
        -1611,
        -1151.6
      ],
      [
        -1622.7,
        -1148.9
      ],
      [
        -1619.6,
        -1135.4
      ],
      [
        -1613.4,
        -1136.7
      ]
    ]
  },
  {
    "x": -1675.9,
    "z": -1202,
    "w": 14.7,
    "d": 11.6,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1673.2,
        -1205.2
      ],
      [
        -1682.4,
        -1208.4
      ],
      [
        -1685.4,
        -1199.9
      ],
      [
        -1676.6,
        -1196.8
      ],
      [
        -1675.4,
        -1200.5
      ],
      [
        -1671.2,
        -1199.1
      ],
      [
        -1670.7,
        -1201.9
      ],
      [
        -1672.3,
        -1204.6
      ]
    ]
  },
  {
    "x": -1689.5,
    "z": -961.3,
    "w": 12.8,
    "d": 15.3,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1693.5,
        -951
      ],
      [
        -1682.6,
        -953
      ],
      [
        -1684.6,
        -964.6
      ],
      [
        -1687.9,
        -963.9
      ],
      [
        -1688.4,
        -966.3
      ],
      [
        -1691.9,
        -965.8
      ],
      [
        -1691.7,
        -963.3
      ],
      [
        -1695.4,
        -962.7
      ]
    ]
  },
  {
    "x": -1667.6,
    "z": -1049.5,
    "w": 13.2,
    "d": 13.7,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1664.9,
        -1046.9
      ],
      [
        -1661.6,
        -1047.7
      ],
      [
        -1663.9,
        -1057.3
      ],
      [
        -1674.8,
        -1054.9
      ],
      [
        -1672.2,
        -1043.6
      ],
      [
        -1664.6,
        -1045.4
      ]
    ]
  },
  {
    "x": -1512.8,
    "z": -996.2,
    "w": 17.5,
    "d": 12.9,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1521.1,
        -996.5
      ],
      [
        -1519,
        -986.9
      ],
      [
        -1503.6,
        -990.1
      ],
      [
        -1505.6,
        -999.8
      ],
      [
        -1515.7,
        -997.6
      ]
    ]
  },
  {
    "x": -1622.9,
    "z": -1222.8,
    "w": 16.5,
    "d": 21.1,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1621.4,
        -1229.8
      ],
      [
        -1626.8,
        -1233.2
      ],
      [
        -1633,
        -1218.5
      ],
      [
        -1618.9,
        -1212.1
      ],
      [
        -1616.7,
        -1217.1
      ],
      [
        -1617.1,
        -1223.6
      ],
      [
        -1619.4,
        -1227.6
      ]
    ]
  },
  {
    "x": -1598.6,
    "z": -1002.2,
    "w": 17.3,
    "d": 14.8,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1594.6,
        -1001
      ],
      [
        -1589.2,
        -1002.1
      ],
      [
        -1590.5,
        -1008.8
      ],
      [
        -1596.3,
        -1007.6
      ],
      [
        -1596.9,
        -1010.3
      ],
      [
        -1605.1,
        -1008.6
      ],
      [
        -1604.4,
        -1005.5
      ],
      [
        -1606.5,
        -1005.1
      ],
      [
        -1604.7,
        -996.5
      ],
      [
        -1601.8,
        -997.1
      ],
      [
        -1601.5,
        -995.5
      ],
      [
        -1597,
        -996.5
      ],
      [
        -1594,
        -998.3
      ]
    ]
  },
  {
    "x": -1183.1,
    "z": -1115,
    "w": 29.1,
    "d": 18.9,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1171.8,
        -1105.5
      ],
      [
        -1168.5,
        -1113.6
      ],
      [
        -1194.3,
        -1124.4
      ],
      [
        -1197.6,
        -1116.5
      ]
    ]
  },
  {
    "x": -1717.4,
    "z": -975.9,
    "w": 9.4,
    "d": 26.9,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1712.7,
        -963.1
      ],
      [
        -1717.9,
        -989.3
      ],
      [
        -1722.1,
        -988.7
      ],
      [
        -1716.7,
        -962.4
      ]
    ]
  },
  {
    "x": -1635.7,
    "z": -1254.4,
    "w": 20.2,
    "d": 16.6,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1628.1,
        -1244.6
      ],
      [
        -1624.3,
        -1250.8
      ],
      [
        -1640.6,
        -1261.2
      ],
      [
        -1644.5,
        -1255
      ]
    ]
  },
  {
    "x": -1049.5,
    "z": -1176.6,
    "w": 16.1,
    "d": 15.9,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1048.4,
        -1177.9
      ],
      [
        -1047,
        -1181.2
      ],
      [
        -1054.8,
        -1183.9
      ],
      [
        -1058.7,
        -1172.8
      ],
      [
        -1045.4,
        -1168
      ],
      [
        -1042.6,
        -1175.8
      ]
    ]
  },
  {
    "x": -1640.1,
    "z": -1223,
    "w": 19.3,
    "d": 11.3,
    "h": 3.1,
    "color": 14470064,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1641.8,
        -1225
      ],
      [
        -1648.8,
        -1228
      ],
      [
        -1650.6,
        -1224
      ],
      [
        -1633.8,
        -1216.7
      ],
      [
        -1631.3,
        -1222.2
      ],
      [
        -1641.1,
        -1226.6
      ]
    ]
  },
  {
    "x": -970.1,
    "z": -1350.7,
    "w": 8.7,
    "d": 7,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -973.3,
        -1347.2
      ],
      [
        -965.8,
        -1349
      ],
      [
        -967,
        -1354.2
      ],
      [
        -974.5,
        -1352.4
      ]
    ]
  },
  {
    "x": -950.4,
    "z": -1457.8,
    "w": 12.5,
    "d": 11.4,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -956.7,
        -1463.8
      ],
      [
        -955.5,
        -1453.8
      ],
      [
        -944.2,
        -1455.1
      ],
      [
        -945.4,
        -1465.2
      ]
    ]
  },
  {
    "x": -963.1,
    "z": -1384.1,
    "w": 10.7,
    "d": 5.2,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -967.4,
        -1380.8
      ],
      [
        -957.7,
        -1382.1
      ],
      [
        -958.2,
        -1386
      ],
      [
        -968.4,
        -1384.9
      ]
    ]
  },
  {
    "x": -976.3,
    "z": -1421.3,
    "w": 11,
    "d": 21.1,
    "h": 3.1,
    "color": 15062718,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -975.1,
        -1419.5
      ],
      [
        -970.9,
        -1420.4
      ],
      [
        -975,
        -1433.9
      ],
      [
        -981.9,
        -1431.8
      ],
      [
        -977.1,
        -1412.8
      ],
      [
        -973.8,
        -1413.4
      ]
    ]
  },
  {
    "x": -969.8,
    "z": -1418.1,
    "w": 11.1,
    "d": 8.2,
    "h": 6.2,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -975.1,
        -1419.5
      ],
      [
        -973.8,
        -1413.4
      ],
      [
        -964,
        -1415.4
      ],
      [
        -965.4,
        -1421.6
      ],
      [
        -970.9,
        -1420.4
      ]
    ]
  },
  {
    "x": -1501.5,
    "z": -1049.4,
    "w": 13.9,
    "d": 12,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1508.4,
        -1052.6
      ],
      [
        -1496.7,
        -1055.4
      ],
      [
        -1494.5,
        -1046.2
      ],
      [
        -1506.3,
        -1043.4
      ]
    ]
  },
  {
    "x": -1492.5,
    "z": -1031.2,
    "w": 16,
    "d": 13.5,
    "h": 3.1,
    "color": 14272165,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1498.4,
        -1035
      ],
      [
        -1483.5,
        -1038.9
      ],
      [
        -1482.4,
        -1033.9
      ],
      [
        -1488.5,
        -1032.3
      ],
      [
        -1487.2,
        -1027.6
      ],
      [
        -1495.5,
        -1025.4
      ],
      [
        -1496.2,
        -1027.8
      ],
      [
        -1497.6,
        -1028.5
      ],
      [
        -1497.4,
        -1031.7
      ]
    ]
  },
  {
    "x": -1543.3,
    "z": -1064.8,
    "w": 11.7,
    "d": 11.4,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1549.1,
        -1068.5
      ],
      [
        -1539.4,
        -1070.5
      ],
      [
        -1537.4,
        -1061.1
      ],
      [
        -1547.1,
        -1059.1
      ]
    ]
  },
  {
    "x": -1599.1,
    "z": -1150.8,
    "w": 11.8,
    "d": 14,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1604.8,
        -1157.7
      ],
      [
        -1594.3,
        -1159.1
      ],
      [
        -1593,
        -1149.2
      ],
      [
        -1599.9,
        -1148.3
      ],
      [
        -1599.6,
        -1145.6
      ],
      [
        -1603.2,
        -1145.1
      ]
    ]
  },
  {
    "x": -1708.3,
    "z": -1084.7,
    "w": 13.1,
    "d": 10.6,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1713.3,
        -1079.9
      ],
      [
        -1700.4,
        -1080.6
      ],
      [
        -1701,
        -1090.5
      ],
      [
        -1710.9,
        -1089.9
      ],
      [
        -1710.5,
        -1083.9
      ],
      [
        -1713.5,
        -1083.7
      ]
    ]
  },
  {
    "x": -1709.7,
    "z": -1104.1,
    "w": 12.7,
    "d": 10.7,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1712.1,
        -1109.1
      ],
      [
        -1711.7,
        -1103.3
      ],
      [
        -1714.8,
        -1103.1
      ],
      [
        -1714.5,
        -1099.1
      ],
      [
        -1702.1,
        -1100
      ],
      [
        -1702.8,
        -1109.8
      ]
    ]
  },
  {
    "x": -1492.5,
    "z": -1571.7,
    "w": 21.3,
    "d": 17.4,
    "h": 7.2,
    "color": 14272165,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1503.1,
        -1571
      ],
      [
        -1498.7,
        -1580.4
      ],
      [
        -1481.8,
        -1572.4
      ],
      [
        -1486.2,
        -1563
      ]
    ]
  },
  {
    "x": -1513.2,
    "z": -1584.8,
    "w": 20.5,
    "d": 16.6,
    "h": 7.2,
    "color": 15590612,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1507.1,
        -1576.5
      ],
      [
        -1523.4,
        -1583.6
      ],
      [
        -1519.3,
        -1593.1
      ],
      [
        -1502.9,
        -1586
      ]
    ]
  },
  {
    "x": -1456.2,
    "z": -1522.9,
    "w": 17.3,
    "d": 28.8,
    "h": 7.2,
    "color": 15062718,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1457.5,
        -1536.9
      ],
      [
        -1467.7,
        -1513
      ],
      [
        -1456.3,
        -1508.1
      ],
      [
        -1450.4,
        -1521.9
      ],
      [
        -1454.8,
        -1523.7
      ],
      [
        -1450.5,
        -1533.9
      ]
    ]
  },
  {
    "x": -1104.1,
    "z": -1199.6,
    "w": 70.6,
    "d": 59.5,
    "h": 15,
    "color": 15065045,
    "roofColor": 6054504,
    "style": "blok",
    "roofStyle": "flat",
    "polygon": [
      [
        -1139.4,
        -1199.6
      ],
      [
        -1128.5,
        -1225.7
      ],
      [
        -1068.8,
        -1200.7
      ],
      [
        -1083.3,
        -1166.2
      ],
      [
        -1099.4,
        -1173
      ],
      [
        -1090,
        -1195.4
      ],
      [
        -1088.2,
        -1194.6
      ],
      [
        -1086.9,
        -1197.7
      ],
      [
        -1118.7,
        -1211
      ],
      [
        -1120.1,
        -1207.8
      ],
      [
        -1118.2,
        -1207
      ],
      [
        -1124.1,
        -1193.1
      ],
      [
        -1132.2,
        -1196.5
      ]
    ]
  },
  {
    "x": -1079.4,
    "z": -1262.4,
    "w": 73.3,
    "d": 58.5,
    "h": 15.5,
    "color": 15065045,
    "roofColor": 6054504,
    "style": "blok",
    "roofStyle": "flat",
    "polygon": [
      [
        -1115.3,
        -1257.5
      ],
      [
        -1101.1,
        -1291
      ],
      [
        -1042,
        -1265.9
      ],
      [
        -1056.2,
        -1232.5
      ],
      [
        -1071.5,
        -1239
      ],
      [
        -1062.3,
        -1260.5
      ],
      [
        -1060.5,
        -1259.8
      ],
      [
        -1059.7,
        -1263.3
      ],
      [
        -1090.6,
        -1276.5
      ],
      [
        -1092.1,
        -1272.9
      ],
      [
        -1090.6,
        -1272.2
      ],
      [
        -1099.6,
        -1251
      ],
      [
        -1104.3,
        -1253
      ],
      [
        -1103.7,
        -1254.5
      ],
      [
        -1110.2,
        -1257.3
      ],
      [
        -1110.9,
        -1255.7
      ]
    ]
  },
  {
    "x": -1056.5,
    "z": -1275.8,
    "w": 9.1,
    "d": 9.1,
    "h": 7.2,
    "color": 14272165,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1061.1,
        -1274
      ],
      [
        -1058.3,
        -1280.4
      ],
      [
        -1052,
        -1277.6
      ],
      [
        -1054.8,
        -1271.3
      ]
    ]
  },
  {
    "x": -1153.7,
    "z": -1233.5,
    "w": 9.9,
    "d": 13.7,
    "h": 7.2,
    "color": 15590612,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1157.8,
        -1229.8
      ],
      [
        -1152.8,
        -1241.4
      ],
      [
        -1147.9,
        -1239.3
      ],
      [
        -1152.8,
        -1227.7
      ],
      [
        -1157.1,
        -1229.5
      ]
    ]
  },
  {
    "x": -1439.3,
    "z": -1511.7,
    "w": 16.4,
    "d": 13.1,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1438.4,
        -1506.3
      ],
      [
        -1446.6,
        -1510.2
      ],
      [
        -1445,
        -1513.6
      ],
      [
        -1443.2,
        -1512.8
      ],
      [
        -1440,
        -1519.4
      ],
      [
        -1430.2,
        -1514.8
      ],
      [
        -1433.6,
        -1507.6
      ],
      [
        -1437.1,
        -1509.1
      ]
    ]
  },
  {
    "x": -1443.2,
    "z": -1503.5,
    "w": 13.2,
    "d": 15.7,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1439.8,
        -1494.5
      ],
      [
        -1449.6,
        -1499.2
      ],
      [
        -1446.5,
        -1505.9
      ],
      [
        -1448.2,
        -1506.7
      ],
      [
        -1446.6,
        -1510.2
      ],
      [
        -1438.4,
        -1506.2
      ],
      [
        -1439.8,
        -1503.4
      ],
      [
        -1436.4,
        -1501.7
      ]
    ]
  },
  {
    "x": -1572.2,
    "z": -707.4,
    "w": 15.6,
    "d": 10.1,
    "h": 7.2,
    "color": 15261651,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1580,
        -709.8
      ],
      [
        -1565.8,
        -712.5
      ],
      [
        -1564.4,
        -705
      ],
      [
        -1578.6,
        -702.4
      ]
    ]
  },
  {
    "x": -1555.5,
    "z": -983.5,
    "w": 12.1,
    "d": 10.1,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1549.4,
        -980.2
      ],
      [
        -1560.2,
        -978.4
      ],
      [
        -1561.5,
        -986.8
      ],
      [
        -1550.7,
        -988.5
      ]
    ]
  },
  {
    "x": -1495.9,
    "z": -1534.5,
    "w": 16.4,
    "d": 16,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1493.1,
        -1526.5
      ],
      [
        -1504.1,
        -1532.3
      ],
      [
        -1498.7,
        -1542.5
      ],
      [
        -1487.7,
        -1536.7
      ]
    ]
  },
  {
    "x": -1179.3,
    "z": -1157.5,
    "w": 20,
    "d": 20.2,
    "h": 3.1,
    "color": 14473940,
    "roofColor": 6120040,
    "style": "retail",
    "roofStyle": "flat",
    "polygon": [
      [
        -1183.2,
        -1167.6
      ],
      [
        -1169.2,
        -1161.4
      ],
      [
        -1175.5,
        -1147.4
      ],
      [
        -1189.2,
        -1153.6
      ]
    ]
  },
  {
    "x": -1667,
    "z": -1216.6,
    "w": 14.1,
    "d": 15.8,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1661.1,
        -1216.2
      ],
      [
        -1659.2,
        -1221.9
      ],
      [
        -1669.4,
        -1225.4
      ],
      [
        -1670.2,
        -1221.3
      ],
      [
        -1672.4,
        -1213.8
      ],
      [
        -1669.5,
        -1212.8
      ],
      [
        -1667,
        -1210.9
      ],
      [
        -1660.2,
        -1209.6
      ],
      [
        -1658.3,
        -1215.3
      ]
    ]
  },
  {
    "x": -1400.6,
    "z": -1501.1,
    "w": 14.5,
    "d": 14.9,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1396.7,
        -1494.9
      ],
      [
        -1401,
        -1497
      ],
      [
        -1400.1,
        -1499
      ],
      [
        -1403.3,
        -1500.6
      ],
      [
        -1404.4,
        -1502.3
      ],
      [
        -1403.7,
        -1503.8
      ],
      [
        -1407,
        -1505.3
      ],
      [
        -1404.8,
        -1509.8
      ],
      [
        -1392.5,
        -1503.7
      ],
      [
        -1395.8,
        -1496.8
      ]
    ]
  },
  {
    "x": -1389.5,
    "z": -1491.4,
    "w": 17.1,
    "d": 19.3,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1386.4,
        -1484.4
      ],
      [
        -1391,
        -1487.3
      ],
      [
        -1389.2,
        -1491.1
      ],
      [
        -1391.7,
        -1489.3
      ],
      [
        -1394.8,
        -1490.9
      ],
      [
        -1392.1,
        -1496.4
      ],
      [
        -1395.3,
        -1497.9
      ],
      [
        -1392.5,
        -1503.7
      ],
      [
        -1378.2,
        -1496.8
      ],
      [
        -1382.5,
        -1487.9
      ],
      [
        -1384.3,
        -1488.7
      ]
    ]
  },
  {
    "x": -1423,
    "z": -1494.7,
    "w": 14.4,
    "d": 17.1,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1422.4,
        -1486
      ],
      [
        -1431.3,
        -1490.3
      ],
      [
        -1425.1,
        -1503.1
      ],
      [
        -1419.4,
        -1500.3
      ],
      [
        -1420.2,
        -1498.7
      ],
      [
        -1416.9,
        -1497.1
      ]
    ]
  },
  {
    "x": -1415.8,
    "z": -1489.2,
    "w": 13.3,
    "d": 15.5,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1413.3,
        -1481.6
      ],
      [
        -1422.4,
        -1486
      ],
      [
        -1416.9,
        -1497.1
      ],
      [
        -1413.6,
        -1495.6
      ],
      [
        -1409.1,
        -1490.4
      ]
    ]
  },
  {
    "x": -1497.1,
    "z": -854.9,
    "w": 10.8,
    "d": 9.7,
    "h": 6.2,
    "color": 14470064,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1501.8,
        -850.1
      ],
      [
        -1502.5,
        -859
      ],
      [
        -1492.5,
        -859.8
      ],
      [
        -1491.7,
        -850.9
      ]
    ]
  },
  {
    "x": -1734.6,
    "z": -1212.5,
    "w": 18.6,
    "d": 11.1,
    "h": 6.2,
    "color": 15261651,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1725.9,
        -1206.8
      ],
      [
        -1743.8,
        -1208.3
      ],
      [
        -1742.9,
        -1217.9
      ],
      [
        -1730.9,
        -1216.9
      ],
      [
        -1731.1,
        -1215.1
      ],
      [
        -1725.2,
        -1214.6
      ]
    ]
  },
  {
    "x": -1638,
    "z": -1564.7,
    "w": 16,
    "d": 19.4,
    "h": 6.2,
    "color": 14272165,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1635.5,
        -1555.2
      ],
      [
        -1643.8,
        -1563.6
      ],
      [
        -1642,
        -1565.6
      ],
      [
        -1645.5,
        -1568.7
      ],
      [
        -1640.2,
        -1574.6
      ],
      [
        -1633.7,
        -1568.8
      ],
      [
        -1629.5,
        -1565.1
      ],
      [
        -1634.4,
        -1559.6
      ],
      [
        -1632.9,
        -1558.2
      ]
    ]
  },
  {
    "x": -1646.5,
    "z": -1555.2,
    "w": 19.8,
    "d": 15.5,
    "h": 6.2,
    "color": 15590612,
    "roofColor": 9122852,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1645.9,
        -1546.7
      ],
      [
        -1649.4,
        -1549.9
      ],
      [
        -1656.6,
        -1556.2
      ],
      [
        -1651.2,
        -1562.1
      ],
      [
        -1647.8,
        -1559.1
      ],
      [
        -1646,
        -1561.1
      ],
      [
        -1636.8,
        -1553.8
      ],
      [
        -1639.5,
        -1550.8
      ],
      [
        -1641,
        -1552.1
      ]
    ]
  },
  {
    "x": -1544.2,
    "z": -1449.8,
    "w": 16.2,
    "d": 14.9,
    "h": 6.2,
    "color": 15062718,
    "roofColor": 7024162,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1540.9,
        -1442.4
      ],
      [
        -1552.3,
        -1449.3
      ],
      [
        -1547.4,
        -1457.3
      ],
      [
        -1536.1,
        -1450.4
      ]
    ]
  },
  {
    "x": -1214.4,
    "z": -1001.7,
    "w": 36.2,
    "d": 21.2,
    "h": 7.2,
    "color": 14470064,
    "roofColor": 3882306,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1229.2,
        -1001.8
      ],
      [
        -1196.3,
        -989.9
      ],
      [
        -1193,
        -999.3
      ],
      [
        -1226,
        -1011.1
      ],
      [
        -1227.5,
        -1006.6
      ]
    ]
  },
  {
    "x": -1511.6,
    "z": -706.3,
    "w": 16,
    "d": 9.2,
    "h": 3.1,
    "color": 15261651,
    "roofColor": 5388076,
    "style": "domek",
    "roofStyle": "gable",
    "polygon": [
      [
        -1503.6,
        -704.9
      ],
      [
        -1518.3,
        -701.7
      ],
      [
        -1519.6,
        -707.7
      ],
      [
        -1504.9,
        -710.9
      ]
    ]
  }
];
