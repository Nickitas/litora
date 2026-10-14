import type { ShorelinePointSeriesDto, ShorelineVisualizationChunkDto, ShorelineVisualizationIndexDto } from "@litora/contracts";

// Результат CLI: lito erosion --black-sea-sochi --offline --steps 3.
// Временные метки и значения получены из Go; не изменять их в web.
export const shorelineDemoIndex: ShorelineVisualizationIndexDto = {
  "schemaVersion": 1,
  "mode": "calendar",
  "scenarioStatus": "demo",
  "usageLimitations": [
    "Использован оперативный прогноз Open-Meteo Marine, а не архив наблюдений или реанализ.",
    "Расчёт охватывает 3 ч (3 состояний волн), поэтому не оценивает годовой размыв.",
    "Батиметрия содержит 7 точек; статус паспорта: passport_missing.",
    "Результат нельзя использовать для калибровки, проектного решения или научной публикации."
  ],
  "waveSource": "Open-Meteo Marine, точка 43.625N 39.70834E, выгружено 2026-08-18T18:12:34Z",
  "bathymetrySha256": "8364084b961b05f56b39059ca64b1dfcd26a08347b91338ffe819bdb0a47d0c5",
  "bathymetryStatus": "passport_missing",
  "crs": "EPSG:4326",
  "coordinateUnit": "degrees",
  "bounds": [
    39.667927,
    43.585476,
    39.71292470651463,
    43.64424580794072
  ],
  "pointCount": 13,
  "pointSeries": {
    "groupSize": 10
  },
  "frames": [
    {
      "index": 0,
      "time": "2026-08-18T00:00:00Z",
      "chunkId": "000001",
      "durationHours": null,
      "waveHeightM": null,
      "erodedVolumeM3": null,
      "depositedVolumeM3": null,
      "balanceClosureResidualM3": null
    },
    {
      "index": 1,
      "time": "2026-08-18T01:00:00Z",
      "chunkId": "000001",
      "durationHours": 1,
      "waveHeightM": 0.14,
      "erodedVolumeM3": 3.3911336724265064,
      "depositedVolumeM3": 3.3911336724265073,
      "balanceClosureResidualM3": 0
    },
    {
      "index": 2,
      "time": "2026-08-18T02:00:00Z",
      "chunkId": "000001",
      "durationHours": 1,
      "waveHeightM": 0.16,
      "erodedVolumeM3": 4.455396464110219,
      "depositedVolumeM3": 4.45539646411022,
      "balanceClosureResidualM3": 0
    },
    {
      "index": 3,
      "time": "2026-08-18T03:00:00Z",
      "chunkId": "000001",
      "durationHours": 1,
      "waveHeightM": 0.16,
      "erodedVolumeM3": 4.025540545343864,
      "depositedVolumeM3": 4.025540545343863,
      "balanceClosureResidualM3": -3.3306690738754696e-16
    }
  ]
};

export const shorelineDemoChunk: ShorelineVisualizationChunkDto = {
  "schemaVersion": 1,
  "id": "000001",
  "frames": [
    {
      "index": 0,
      "points": [
        {
          "lat": 43.585476,
          "lon": 39.7129247
        },
        {
          "lat": 43.5924374,
          "lon": 39.710089
        },
        {
          "lat": 43.599683,
          "lon": 39.7076189
        },
        {
          "lat": 43.6069904,
          "lon": 39.7049418
        },
        {
          "lat": 43.6141286,
          "lon": 39.702295
        },
        {
          "lat": 43.6205021,
          "lon": 39.6995026
        },
        {
          "lat": 43.6232291,
          "lon": 39.6976633
        },
        {
          "lat": 43.6254352,
          "lon": 39.6948478
        },
        {
          "lat": 43.6306556,
          "lon": 39.6907965
        },
        {
          "lat": 43.6341751,
          "lon": 39.6853954
        },
        {
          "lat": 43.6389198,
          "lon": 39.6792709
        },
        {
          "lat": 43.6407472,
          "lon": 39.6739089
        },
        {
          "lat": 43.6442458,
          "lon": 39.667927
        }
      ],
      "cells": []
    },
    {
      "index": 1,
      "points": [
        {
          "lat": 43.585476000370015,
          "lon": 39.71292470173322
        },
        {
          "lat": 43.592437400189645,
          "lon": 39.71008900096893
        },
        {
          "lat": 43.5996830001672,
          "lon": 39.70761890090201
        },
        {
          "lat": 43.60699039998269,
          "lon": 39.70494179991038
        },
        {
          "lat": 43.61412859993957,
          "lon": 39.70229499971354
        },
        {
          "lat": 43.62050209956318,
          "lon": 39.69950259836232
        },
        {
          "lat": 43.623229099109004,
          "lon": 39.697663298198236
        },
        {
          "lat": 43.62543519982509,
          "lon": 39.69484779963906
        },
        {
          "lat": 43.63065559952725,
          "lon": 39.69079649916594
        },
        {
          "lat": 43.634175099406015,
          "lon": 39.68539539918732
        },
        {
          "lat": 43.63891979943926,
          "lon": 39.679270899387824
        },
        {
          "lat": 43.64074720003434,
          "lon": 39.67390890003077
        },
        {
          "lat": 43.64424580337193,
          "lon": 39.667927003763005
        }
      ],
      "cells": [
        {
          "pointIndex": 0,
          "shorelineChangeM": -0.00014546030798214817
        },
        {
          "pointIndex": 1,
          "shorelineChangeM": -0.00008079664710157495
        },
        {
          "pointIndex": 2,
          "shorelineChangeM": -0.00007495218819571433
        },
        {
          "pointIndex": 3,
          "shorelineChangeM": 0.000007466834440586878
        },
        {
          "pointIndex": 4,
          "shorelineChangeM": 0.000024018639563268667
        },
        {
          "pointIndex": 5,
          "shorelineChangeM": 0.00014049301658821732
        },
        {
          "pointIndex": 6,
          "shorelineChangeM": 0.00017564697664280578
        },
        {
          "pointIndex": 7,
          "shorelineChangeM": 0.00003496365155362692
        },
        {
          "pointIndex": 8,
          "shorelineChangeM": 0.00008527035969037964
        },
        {
          "pointIndex": 9,
          "shorelineChangeM": 0.0000929620332368551
        },
        {
          "pointIndex": 10,
          "shorelineChangeM": 0.00007947364787455961
        },
        {
          "pointIndex": 11,
          "shorelineChangeM": -0.00000455148265209688
        },
        {
          "pointIndex": 12,
          "shorelineChangeM": -0.00048201415674280413
        }
      ]
    },
    {
      "index": 2,
      "points": [
        {
          "lat": 43.58547600083388,
          "lon": 39.71292470390606
        },
        {
          "lat": 43.592437400524716,
          "lon": 39.71008900268086
        },
        {
          "lat": 43.59968300047002,
          "lon": 39.707618902535735
        },
        {
          "lat": 43.60699039996474,
          "lon": 39.70494179981742
        },
        {
          "lat": 43.61412859987406,
          "lon": 39.70229499940303
        },
        {
          "lat": 43.620502099037196,
          "lon": 39.69950259639036
        },
        {
          "lat": 43.623229098016516,
          "lon": 39.697663295989024
        },
        {
          "lat": 43.625435199592246,
          "lon": 39.69484779915856
        },
        {
          "lat": 43.630655598880644,
          "lon": 39.69079649802515
        },
        {
          "lat": 43.63417509855746,
          "lon": 39.685395398026365
        },
        {
          "lat": 43.63891979859204,
          "lon": 39.67927089846288
        },
        {
          "lat": 43.64074720008634,
          "lon": 39.67390890007735
        },
        {
          "lat": 43.644245806489906,
          "lon": 39.66792700724262
        }
      ],
      "cells": [
        {
          "pointIndex": 0,
          "shorelineChangeM": -0.0001823553744709906
        },
        {
          "pointIndex": 1,
          "shorelineChangeM": -0.00014275434144038577
        },
        {
          "pointIndex": 2,
          "shorelineChangeM": -0.00013575344847504333
        },
        {
          "pointIndex": 3,
          "shorelineChangeM": 0.000007744881341336274
        },
        {
          "pointIndex": 4,
          "shorelineChangeM": 0.00002603517156908192
        },
        {
          "pointIndex": 5,
          "shorelineChangeM": 0.00016917061639455766
        },
        {
          "pointIndex": 6,
          "shorelineChangeM": 0.00021536762076096094
        },
        {
          "pointIndex": 7,
          "shorelineChangeM": 0.000046544622265853456
        },
        {
          "pointIndex": 8,
          "shorelineChangeM": 0.00011662975988145746
        },
        {
          "pointIndex": 9,
          "shorelineChangeM": 0.00013280260743409782
        },
        {
          "pointIndex": 10,
          "shorelineChangeM": 0.0001200770105637733
        },
        {
          "pointIndex": 11,
          "shorelineChangeM": -0.000006891485583277814
        },
        {
          "pointIndex": 12,
          "shorelineChangeM": -0.0004457124689936092
        }
      ]
    },
    {
      "index": 3,
      "points": [
        {
          "lat": 43.58547600139076,
          "lon": 39.71292470651463
        },
        {
          "lat": 43.59243740088129,
          "lon": 39.71008900450267
        },
        {
          "lat": 43.5996830007952,
          "lon": 39.70761890429005
        },
        {
          "lat": 43.606990399953524,
          "lon": 39.70494179975939
        },
        {
          "lat": 43.61412859982941,
          "lon": 39.702294999191395
        },
        {
          "lat": 43.62050209861192,
          "lon": 39.69950259479596
        },
        {
          "lat": 43.62322909711072,
          "lon": 39.69766329415735
        },
        {
          "lat": 43.62543519937859,
          "lon": 39.69484779871765
        },
        {
          "lat": 43.630655598269605,
          "lon": 39.69079649694711
        },
        {
          "lat": 43.63417509771965,
          "lon": 39.6853953968801
        },
        {
          "lat": 43.63891979771174,
          "lon": 39.67927089750182
        },
        {
          "lat": 43.64074720014047,
          "lon": 39.673908900125845
        },
        {
          "lat": 43.64424580794072,
          "lon": 39.6679270088617
        }
      ],
      "cells": [
        {
          "pointIndex": 0,
          "shorelineChangeM": -0.00021892379519467738
        },
        {
          "pointIndex": 1,
          "shorelineChangeM": -0.00015191703883370795
        },
        {
          "pointIndex": 2,
          "shorelineChangeM": -0.00014577389386686795
        },
        {
          "pointIndex": 3,
          "shorelineChangeM": 0.0000048349245546575966
        },
        {
          "pointIndex": 4,
          "shorelineChangeM": 0.000017745022069687244
        },
        {
          "pointIndex": 5,
          "shorelineChangeM": 0.00013678027380156703
        },
        {
          "pointIndex": 6,
          "shorelineChangeM": 0.00017856255313183783
        },
        {
          "pointIndex": 7,
          "shorelineChangeM": 0.00004270961481032958
        },
        {
          "pointIndex": 8,
          "shorelineChangeM": 0.00011021447006948239
        },
        {
          "pointIndex": 9,
          "shorelineChangeM": 0.000131121976802829
        },
        {
          "pointIndex": 10,
          "shorelineChangeM": 0.0001247654715065546
        },
        {
          "pointIndex": 11,
          "shorelineChangeM": -0.0000071738516909262745
        },
        {
          "pointIndex": 12,
          "shorelineChangeM": -0.00020739309275784462
        }
      ]
    }
  ]
};

export const shorelineDemoSeries: ShorelinePointSeriesDto[] = [
  {
    "schemaVersion": 1,
    "pointIndex": 0,
    "shorelineChangeM": [
      null,
      -0.00014546030798214817,
      -0.0001823553744709906,
      -0.00021892379519467738
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 1,
    "shorelineChangeM": [
      null,
      -0.00008079664710157495,
      -0.00014275434144038577,
      -0.00015191703883370795
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 2,
    "shorelineChangeM": [
      null,
      -0.00007495218819571433,
      -0.00013575344847504333,
      -0.00014577389386686795
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 3,
    "shorelineChangeM": [
      null,
      0.000007466834440586878,
      0.000007744881341336274,
      0.0000048349245546575966
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 4,
    "shorelineChangeM": [
      null,
      0.000024018639563268667,
      0.00002603517156908192,
      0.000017745022069687244
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 5,
    "shorelineChangeM": [
      null,
      0.00014049301658821732,
      0.00016917061639455766,
      0.00013678027380156703
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 6,
    "shorelineChangeM": [
      null,
      0.00017564697664280578,
      0.00021536762076096094,
      0.00017856255313183783
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 7,
    "shorelineChangeM": [
      null,
      0.00003496365155362692,
      0.000046544622265853456,
      0.00004270961481032958
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 8,
    "shorelineChangeM": [
      null,
      0.00008527035969037964,
      0.00011662975988145746,
      0.00011021447006948239
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 9,
    "shorelineChangeM": [
      null,
      0.0000929620332368551,
      0.00013280260743409782,
      0.000131121976802829
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 10,
    "shorelineChangeM": [
      null,
      0.00007947364787455961,
      0.0001200770105637733,
      0.0001247654715065546
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 11,
    "shorelineChangeM": [
      null,
      -0.00000455148265209688,
      -0.000006891485583277814,
      -0.0000071738516909262745
    ]
  },
  {
    "schemaVersion": 1,
    "pointIndex": 12,
    "shorelineChangeM": [
      null,
      -0.00048201415674280413,
      -0.0004457124689936092,
      -0.00020739309275784462
    ]
  }
];
