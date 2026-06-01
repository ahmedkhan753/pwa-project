import type { MacadamData } from '@/types/kosztorysMacadam';

/**
 * Toyota Aygo X demo dataset — used by the Phase 1 MVP render
 * until the backend wiring (XML / manual / PDF) is connected.
 * Picsum seeds are deterministic per-damage so reruns look stable.
 */
export const DEMO_MACADAM: MacadamData = {
  vehicle: {
    make_model:         'TOYOTA Aygo X',
    variant:            '1.0 Vvt-I Comfort',
    vin:                'JTDAGNAC200082240',
    registration_plate: 'WPR3123L',
    grupa:              'Po kontrakcie',
    mileage_km:         24917,
    first_registration: '11.01.2023',
    body_colour:        'Czarny',
    klient:             'Ayvens Poland',
    inspection_date:    '03.12.2025 15:22:37',
    inspection_address: 'Centrum Logistyczne Łajski',
    main_photo_url:     'https://picsum.photos/seed/aygohero/1200/800',
  },
  parts: [
    {
      id:                    'p1',
      index:                 1,
      location:              'interior',
      czesc:                 'Kluczyk zapasowy',
      typ:                   'Brak',
      tryb_naprawy:          'Wymiana',
      koszty_naprawy_pln:    800,
      koszt_amortyzacji_pln: 0,
      koszt_netto_pln:       800,
      photos: ['https://picsum.photos/seed/aygokey1/800/600'],
    },
    {
      id:                    'p2',
      index:                 2,
      location:              'exterior',
      czesc:                 'Dach',
      typ:                   'Uszkodzenia od gradu',
      tryb_naprawy:          'Naprawa i lakierowanie (kompletne)',
      koszty_naprawy_pln:    2015.75,
      koszt_amortyzacji_pln: 503.94,
      koszt_netto_pln:       1511.81,
      photos: [
        'https://picsum.photos/seed/aygodach1/800/600',
        'https://picsum.photos/seed/aygodach2/800/600',
        'https://picsum.photos/seed/aygodach3/800/600',
        'https://picsum.photos/seed/aygodach4/800/600',
      ],
    },
    {
      id:                    'p3',
      index:                 3,
      location:              'exterior',
      czesc:                 'Drzwi PL',
      typ:                   'Wgniecenie(a)',
      tryb_naprawy:          'Lakierowanie',
      koszty_naprawy_pln:    1211.68,
      koszt_amortyzacji_pln: 302.92,
      koszt_netto_pln:       908.76,
      photos: [
        'https://picsum.photos/seed/aygopl1/800/600',
        'https://picsum.photos/seed/aygopl2/800/600',
        'https://picsum.photos/seed/aygopl3/800/600',
        'https://picsum.photos/seed/aygopl4/800/600',
        'https://picsum.photos/seed/aygopl5/800/600',
      ],
    },
    {
      id:                    'p4',
      index:                 4,
      location:              'exterior',
      czesc:                 'Słupek A lewy',
      typ:                   'Wgniecenie(a) i zarysowanie(a)',
      tryb_naprawy:          'Naprawa i lakierowanie (kompletne)',
      koszty_naprawy_pln:    264.10,
      koszt_amortyzacji_pln: 66.02,
      koszt_netto_pln:       198.08,
      photos: [
        'https://picsum.photos/seed/aygosa1/800/600',
        'https://picsum.photos/seed/aygosa2/800/600',
        'https://picsum.photos/seed/aygosa3/800/600',
      ],
    },
  ],
  totals: {
    koszty_naprawy_pln: 4291.53, // 800 + 2015.75 + 1211.68 + 264.10
    amortyzacja_pln:     872.88, //   0 +  503.94 +  302.92 +  66.02
    netto_pln:          3418.65, // 800 + 1511.81 +  908.76 + 198.08
  },
};
