"""
PDF Generator — Protokół zwrotu pojazdu
Generates a vehicle inspection report matching the Zaufaj Rzeczoznawcy template.
Uses DejaVu Sans font for full Polish character support (ł, ś, ż, ą, ę, ó, ń, ć, ź).
"""
import io
import os
import base64
import logging
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    Image, PageBreak
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger("services.pdf_generator")

# ─── Register DejaVu Sans for Polish characters ──────────────
FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

_fonts_registered = False

def _register_fonts():
    global _fonts_registered
    if _fonts_registered:
        return
    try:
        pdfmetrics.registerFont(TTFont('DejaVu', FONT_PATHS[0]))
        pdfmetrics.registerFont(TTFont('DejaVu-Bold', FONT_PATHS[1]))
        _fonts_registered = True
        logger.info("✓ DejaVu Sans fonts registered for Polish character support")
    except Exception as e:
        logger.warning(f"Could not register DejaVu fonts: {e}. Falling back to Helvetica.")

# ─── Styles ───────────────────────────────────────────────────
def _get_styles():
    _register_fonts()
    fn = 'DejaVu' if _fonts_registered else 'Helvetica'
    fnb = 'DejaVu-Bold' if _fonts_registered else 'Helvetica-Bold'

    return {
        'title': ParagraphStyle('MainTitle', fontName=fnb, fontSize=16, alignment=TA_LEFT, spaceAfter=2*mm),
        'subtitle': ParagraphStyle('SubTitle', fontName=fn, fontSize=9, alignment=TA_LEFT, spaceAfter=4*mm, textColor=colors.HexColor('#444444')),
        'section': ParagraphStyle('SectionHeader', fontName=fnb, fontSize=10, spaceBefore=4*mm, spaceAfter=2*mm),
        'small': ParagraphStyle('SmallText', fontName=fn, fontSize=7, alignment=TA_LEFT),
        'siglabel': ParagraphStyle('SigLabel', fontName=fn, fontSize=8, alignment=TA_CENTER, spaceBefore=2*mm),
        'footer': ParagraphStyle('Footer', fontName=fn, fontSize=6, textColor=colors.grey, alignment=TA_CENTER),
        'fn': fn,
        'fnb': fnb,
    }

# ─── Helpers ──────────────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN = 1.5 * cm
CONTENT_W = PAGE_W - 2 * MARGIN

LABEL_BG = colors.HexColor('#F0F0F0')
HEADER_BG = colors.HexColor('#E8E8E8')
GRID_COLOR = colors.HexColor('#BBBBBB')

def _ts(fn, fnb):
    """Base table style."""
    return [
        ('GRID', (0, 0), (-1, -1), 0.5, GRID_COLOR),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, -1), fn),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]

def _kv(rows, fn, fnb, cw=None):
    """2-column label/value table."""
    if cw is None:
        cw = [CONTENT_W * 0.45, CONTENT_W * 0.55]
    style = _ts(fn, fnb) + [
        ('BACKGROUND', (0, 0), (0, -1), LABEL_BG),
        ('FONTNAME', (0, 0), (0, -1), fnb),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
    ]
    t = Table(rows, colWidths=cw)
    t.setStyle(TableStyle(style))
    return t

def _s(val, default=''):
    if val is None: return default
    if isinstance(val, bool): return 'Tak' if val else 'Nie'
    s = str(val).strip()
    return s if s else default

def _t(val):
    if val in ('yes', 'tak', 'Tak', True, 'true'): return 'Tak'
    if val in ('no', 'nie', 'Nie', False, 'false'): return 'Nie'
    if val in ('na', 'n/a', 'N/D', 'nd', 'ND'): return 'N/D'
    return _s(val, '')


# ─── Main Generator ──────────────────────────────────────────
def generate_inspection_pdf(deal_info: dict, inspection_data: dict, logo_path: str = None) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN)

    S = _get_styles()
    fn, fnb = S['fn'], S['fnb']
    story = []

    # Extract sub-sections
    vehicle = inspection_data.get('vehicleData', {})
    basic = vehicle.get('basicInfo', {})
    eq_comp = inspection_data.get('equipmentCompleteness', {})
    full_eq = inspection_data.get('fullEquipment', {})
    paint = inspection_data.get('paintMeasurement', {})
    tires = inspection_data.get('tires', {})
    ext_dmg = inspection_data.get('exteriorDamage', [])
    int_dmg = inspection_data.get('interiorDamage', [])
    mech = inspection_data.get('mechanical', {})
    notes = inspection_data.get('notesValuation', {})
    summary = inspection_data.get('finalSummary', {})

    # ─── HEADER with Logo ────────────────────────────────────
    # Find logo: passed path > backend/assets/logo.png > None
    if not logo_path:
        default_logo = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'logo.png')
        if os.path.exists(default_logo):
            logo_path = default_logo

    title_para = Paragraph("Protokół zwrotu pojazdu", S['title'])
    if logo_path and os.path.exists(logo_path):
        try:
            logo_img = Image(logo_path, width=4*cm, height=1.5*cm)
            logo_img.hAlign = 'RIGHT'
            header_data = [[title_para, logo_img]]
            header_table = Table(header_data, colWidths=[CONTENT_W * 0.60, CONTENT_W * 0.40])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ]))
            story.append(header_table)
        except Exception:
            story.append(title_para)
    else:
        story.append(title_para)

    deal_title = deal_info.get('title', '')
    order_num = deal_info.get('order_number', deal_title)
    story.append(Paragraph(f"<u>Nr zlecenia:</u> {_s(order_num)}", S['subtitle']))
    story.append(Spacer(1, 2*mm))

    # ─── DANE OGLĘDZIN ────────────────────────────────────────
    story.append(Paragraph("DANE OGLĘDZIN", S['section']))
    company = _s(basic.get('companyName') or deal_info.get('company_name'))
    location = _s(basic.get('inspectionPlace') or deal_info.get('inspection_place'))
    owner = _s(basic.get('userOwner') or deal_info.get('client_name'))
    insp_date = _s(basic.get('inspectionDate') or deal_info.get('inspection_date'))

    cw4 = [CONTENT_W*0.22, CONTENT_W*0.28, CONTENT_W*0.22, CONTENT_W*0.28]
    info_rows = [
        ['FIRMA', company, 'MIEJSCE OGLĘDZIN', location],
        ['UŻYTKOWNIK / WŁAŚCICIEL', owner, 'DATA OGLĘDZIN', insp_date],
    ]
    it = Table(info_rows, colWidths=cw4)
    it.setStyle(TableStyle(_ts(fn, fnb) + [
        ('BACKGROUND', (0,0), (0,-1), LABEL_BG), ('BACKGROUND', (2,0), (2,-1), LABEL_BG),
        ('FONTNAME', (0,0), (0,-1), fnb), ('FONTNAME', (2,0), (2,-1), fnb),
        ('ALIGN', (0,0), (0,-1), 'CENTER'), ('ALIGN', (2,0), (2,-1), 'CENTER'),
    ]))
    story.append(it)
    story.append(Spacer(1, 3*mm))

    # ─── DANE POJAZDU ─────────────────────────────────────────
    story.append(Paragraph("DANE POJAZDU", S['section']))
    vr = [
        ['DOWÓD REJESTRACYJNY', _s(vehicle.get('registrationCertificate'))],
        ['ROK PRODUKCJI', _s(vehicle.get('year'))],
        ['MARKA, MODEL', f"{_s(vehicle.get('make'))}, {_s(vehicle.get('model'))}"],
        ['VIN', _s(vehicle.get('vin'))],
        ['DATA 1 REJ.', _s(vehicle.get('firstRegistration'))],
        ['RODZAJ PALIWA', _s(vehicle.get('fuelType'))],
        ['MASA WŁASNA', _s(vehicle.get('ownWeight'))],
        ['ŁADOWNOŚĆ', _s(vehicle.get('loadCapacity'))],
        ['POJEMNOŚĆ cm3', _s(vehicle.get('engineCapacity'))],
        ['MOC KW', _s(vehicle.get('enginePower'))],
        ['ILOŚĆ MIEJSC SIEDZĄCYCH', _s(vehicle.get('seatsCount'))],
        ['NR POLISY', ''],
        ['TOWARZYSTWO UBEZPIECZ.', ''],
        ['PRZEBIEG DO WYPEŁ.', _s(vehicle.get('mileage'))],
        ['STAN ZBIORNIKA', ''],
        ['NAPĘD', _s(vehicle.get('driveType'))],
        ['KOLOR', _s(vehicle.get('color'))],
        ['RODZAJ KOLORU', ''],
        ['STAN POZIOMU OLEJU', _t(mech.get('engineOilLevel'))],
        ['STAN POZIOMU PŁYNU HAMULCOWEGO', _t(mech.get('coolantLevel'))],
        ['STAN PŁYNU UKŁADU WSPOMAGANIA', ''],
        ['STAN POZIOMU PŁYNU UKŁADU CHŁODZENIA', _t(mech.get('coolantLevel'))],
    ]
    story.append(_kv(vr, fn, fnb))
    story.append(Spacer(1, 3*mm))

    # ─── WYPOSAŻENIE ──────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("WYPOSAŻENIE", S['section']))

    equip_items = [
        ('KLUCZYKI', _t(eq_comp.get('keysCount', ''))),
        ('KLUCZYKI ILOŚĆ', _s(eq_comp.get('keysCount', ''))),
        ('NAWIGACJA SATELITARNA', _t(full_eq.get('navigation'))),
        ('KLIMATYZACJA SPRAWNA', _t(full_eq.get('airConditioning'))),
        ('KSIĄŻKA SERWISOWA', _t(eq_comp.get('serviceBookPresented'))),
        ('INSTRUKCJA OBSŁUGI', _t(eq_comp.get('ownerManual'))),
        ('GAŚNICA', _t(eq_comp.get('fireExtinguisher'))),
        ('TRÓJKĄT OSTRZEGAWCZY', _t(eq_comp.get('triangular'))),
        ('KOŁO ZAPASOWE', _t(eq_comp.get('spareWheel'))),
        ('ZESTAW NAPRAWCZY', _t(eq_comp.get('repairKit'))),
        ('DODATKOWY KOMPLET KÓŁ', 'Nie'),
        ('KLUCZ DO KÓŁ', _t(eq_comp.get('jackAndTools'))),
        ('PODNOŚNIK', _t(eq_comp.get('jackAndTools'))),
        ('APTECZKA', _t(eq_comp.get('firstAidKit'))),
        ('ANTENA', 'Nie'),
        ('ABS', _t(full_eq.get('abs'))),
        ('AIRBAG BOCZNY PRZÓD', _t(full_eq.get('airbagSide'))),
        ('AIRBAG BOCZNY TYŁ', _t(full_eq.get('airbagCurtain'))),
        ('AIRBAG NÓG', 'Nie'),
        ('AIRBAG PASAŻERA', _t(full_eq.get('airbagPassenger'))),
        ('ALARM', 'Nie'),
        ('ASR', _t(full_eq.get('esp'))),
        ('AKTYWNY SYSTEM PARKOWANIA', _t(full_eq.get('parkingSensors'))),
        ('ASYSTENT JAZDY NOCNEJ', 'Nie'),
        ('ASYSTENT MARTWEGO PUNKTU', 'Nie'),
        ('ASYSTENT POJAZDU', 'Nie'),
        ('ASYSTENT ZMIANY PASA RUCHU', 'Nie'),
        ('CZUJNIK CIŚNIENIA W OPONACH', 'Nie'),
        ('CZUJNIK DESZCZU', _t(full_eq.get('rainSensors'))),
        ('CZUJNIK PARKOWANIA PRZÓD+TYŁ', _t(full_eq.get('parkingSensors'))),
        ('CZUJNIK PARKOWANIA TYŁ', _t(full_eq.get('rearCamera'))),
        ('CZUJNIK ZMIERZCHU', _t(full_eq.get('lightSensors'))),
        ('DACH OTWIERANY EL.', _t(full_eq.get('sunroof'))),
        ('DACH OTWIERANY Z BATERIĄ SŁONECZNĄ', 'Nie'),
        ('DACH PANORAMICZNY', _t(full_eq.get('panoramicRoof'))),
        ('DOSTĘP KOMFORTOWY', _t(full_eq.get('keylessEntry'))),
        ('DRZWI DOMYKANE ELEKTRYCZNE', 'Nie'),
        ('ESP', _t(full_eq.get('esp'))),
        ('FELGI ALUMINIOWE', _t(full_eq.get('alloyWheels'))),
        ('FELGI STRUKTURALNE', 'Nie'),
        ('FOTELE PRZEDNIE UST. ELEKTRYCZNIE', 'Nie'),
        ('FOTELE PRZEDNIE Z MASAŻEM', 'Nie'),
        ('FOTELE TYLNE REGULOWANE', 'Nie'),
        ('GNIAZDO 230V W BAGAŻNIKU', 'Nie'),
        ('HAK', _t(full_eq.get('towBar'))),
        ('HAMULCE CERAMICZNE', 'Nie'),
        ('HEAD UP DISPLAY', 'Nie'),
        ('INSTALACJA GAZOWA', 'Nie'),
        ('KAMERA PARKOWANIA', _t(full_eq.get('rearCamera'))),
        ('KAMERA 360', 'Nie'),
        ('KIEROWNICA SKÓRZANA', 'Nie'),
        ('KIEROWNICA WIELOFUNKCYJNA', 'Nie'),
        ('KIEROWNICA Z FUNKCJĄ ZMIANY BIEGÓW', 'Nie'),
        ('KLIMATYZACJA MANUALNA', _t(full_eq.get('airConditioning'))),
        ('KLIMATYZACJA AUTOMATYCZNA', _t(full_eq.get('automaticAC'))),
        ('KOLUMNA KIEROWNICY REGUL. ELEK.', 'Nie'),
        ('KOMPUTER POKŁADOWY', _t(full_eq.get('onboardComputer'))),
        ('KURTYNY POWIETRZNE', _t(full_eq.get('airbagCurtain'))),
        ('LAKIER METALIK', 'Nie'),
        ('LUSTERKA OGRZEWANE', _t(full_eq.get('heatedMirrors'))),
        ('LUSTERKA ZEW. PRZYCIEMNIAJĄCE SIĘ', 'Nie'),
        ('LUSTERKA REG. ELEKTRYCZNIE', _t(full_eq.get('electricMirrors'))),
        ('LUSTERKA SKŁADANE ELEKTR.', 'Nie'),
        ('NAWIGACJA', _t(full_eq.get('navigation'))),
        ('OGRZEWANIE PRZEDNICH FOTELI', _t(full_eq.get('heatedSeats'))),
        ('OGRZEWANIE TYLNYCH SIEDZEŃ', 'Nie'),
        ('PODGRZEWANA KIEROWNICA', 'Nie'),
        ('PODŁOKIETNIK PRZÓD', 'Nie'),
        ('PODŁOKIETNIK TYŁ', 'Nie'),
        ('RADIOODBIORNIK', 'Nie'),
        ('RADIOODBIORNIK USB', _t(full_eq.get('usb'))),
        ('RADIOODBIORNIK SD', 'Nie'),
        ('REFLEKTORY KSENONOWE', _t(full_eq.get('xenonLights'))),
        ('REFLEKTORY LED', _t(full_eq.get('ledLights'))),
        ('REFLEKTORY FULL LED', 'Nie'),
        ('REFLEKTORY LASEROWE', 'Nie'),
        ('REFLEKTORY SKRĘTNE', 'Nie'),
        ('REFLEKTORY Z DOŚWIETLANIEM ZAKRĘTÓW', 'Nie'),
        ('RELINGI DACHOWE', _t(full_eq.get('roofRails'))),
        ('SIEDZENIA SPORTOWE', 'Nie'),
        ('SIEDZENIA TYLNA Z MASAŻEM', 'Nie'),
        ('SPRYSKIWACZE REFLEKTORÓW', 'Nie'),
        ('SYSTEM ROZPOZNAW. ZNAKÓW', 'Nie'),
        ('SZYBA PRZEDNIA OGRZEWANA', 'Nie'),
        ('SZYBA PODN.EL.PRZÓD', _t(full_eq.get('electricWindows'))),
        ('SZYBA.PODN.EL.TYL', 'Nie'),
        ('ŚWIATŁA DO JAZDY DZIENNEJ', 'Nie'),
        ('ŚWIATŁA DO JAZDY DZIENNEJ LED', _t(full_eq.get('ledLights'))),
        ('ŚWIATŁA PRZECIWMGIELNE', _t(full_eq.get('fogLights'))),
        ('TAPICERKA SKÓRZANA', 'Nie'),
        ('TAPICERKA WELUROWA', 'Nie'),
        ('TEMPOMAT', _t(full_eq.get('cruiseControl'))),
        ('TEMPOMAT AKTYWNY', 'Nie'),
        ('TRZECI RZĄD SIEDZEŃ', 'Nie'),
        ('WIRTUALNY KOKPIT', 'Nie'),
        ('SZYBY PRZYCIEMNIANE', _t(full_eq.get('tintedWindows'))),
    ]
    story.append(_kv(equip_items, fn, fnb))
    story.append(Spacer(1, 3*mm))

    # ─── OPONY ────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("OPONY", S['section']))

    tire_header = ['POZYCJA', 'MARKA', 'ROZMIAR', 'DOT', 'BIEŻNIK (mm)', 'TYP']
    tire_rows = [tire_header]
    for pn, pk in [('Przód lewy','frontLeft'),('Przód prawy','frontRight'),
                    ('Tył lewy','rearLeft'),('Tył prawy','rearRight')]:
        td = tires.get(pk, {})
        if isinstance(td, dict):
            tire_rows.append([pn, _s(td.get('brand')), _s(td.get('size')),
                              _s(td.get('dot')), _s(td.get('treadDepth')), _s(td.get('type'))])
        else:
            tire_rows.append([pn, '', '', '', '', ''])

    tcw = [CONTENT_W*0.16, CONTENT_W*0.18, CONTENT_W*0.20, CONTENT_W*0.14, CONTENT_W*0.16, CONTENT_W*0.16]
    tt = Table(tire_rows, colWidths=tcw)
    tt.setStyle(TableStyle(_ts(fn, fnb) + [
        ('BACKGROUND', (0,0), (-1,0), HEADER_BG),
        ('FONTNAME', (0,0), (-1,0), fnb),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    story.append(tt)
    story.append(Spacer(1, 3*mm))

    # ─── POMIAR LAKIERU ───────────────────────────────────────
    story.append(Paragraph("POMIAR LAKIERU (µm)", S['section']))

    paint_items = [
        ('Maska','hood'), ('Dach','roof'), ('Klapa bagażnika','trunk'),
        ('Błotnik LP','leftFrontFender'), ('Błotnik PP','rightFrontFender'),
        ('Błotnik LT','leftRearFender'), ('Błotnik PT','rightRearFender'),
        ('Drzwi LP','leftFrontDoor'), ('Drzwi PP','rightFrontDoor'),
        ('Drzwi LT','leftRearDoor'), ('Drzwi PT','rightRearDoor'),
        ('Próg lewy','leftSill'), ('Próg prawy','rightSill'),
        ('Słupek A lewy','leftAColumn'), ('Słupek A prawy','rightAColumn'),
        ('Słupek B lewy','leftBColumn'), ('Słupek B prawy','rightBColumn'),
        ('Słupek C lewy','leftCColumn'), ('Słupek C prawy','rightCColumn'),
        ('Zderzak przód','frontBumper'), ('Zderzak tył','rearBumper'),
    ]
    p_header = ['ELEMENT', 'WARTOŚĆ (µm)', 'STATUS']
    p_rows = [p_header]
    smap = {'ok':'Fabryczny', 'repainted':'Lakierowany', 'putty':'Szpachlowany'}
    for lbl, key in paint_items:
        p = paint.get(key, {})
        if isinstance(p, dict):
            p_rows.append([lbl, _s(p.get('value')), smap.get(p.get('status',''), _s(p.get('status')))])
        else:
            p_rows.append([lbl, '', ''])

    pcw = [CONTENT_W*0.40, CONTENT_W*0.30, CONTENT_W*0.30]
    pt = Table(p_rows, colWidths=pcw)
    pt.setStyle(TableStyle(_ts(fn, fnb) + [
        ('BACKGROUND', (0,0), (-1,0), HEADER_BG),
        ('FONTNAME', (0,0), (-1,0), fnb),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    story.append(pt)
    story.append(Spacer(1, 3*mm))

    # ─── KONTROLA MECHANICZNA ─────────────────────────────────
    story.append(Paragraph("KONTROLA MECHANICZNA", S['section']))
    mech_items = [
        ('Stan silnika','engineCondition'), ('Poziom oleju silnikowego','engineOilLevel'),
        ('Poziom płynu chłodzącego','coolantLevel'), ('Hałasy silnika','engineNoises'),
        ('Dymienie silnika','engineSmoke'), ('Skrzynia biegów','transmission'),
        ('Sprzęgło','clutch'), ('Wał napędowy','driveShaft'),
        ('Zawieszenie przednie','frontSuspension'), ('Zawieszenie tylne','rearSuspension'),
        ('Amortyzatory','shockAbsorbers'), ('Hamulce przednie','frontBrakes'),
        ('Hamulce tylne','rearBrakes'), ('Hamulec ręczny','handbrake'),
        ('Luz kierownicy','steeringPlay'), ('Pompa wspomagania','steeringPump'),
        ('Układ wydechowy','exhaustSystem'), ('Klimatyzacja','airConditioning'),
        ('Układ ogrzewania','heatingSystem'), ('Instalacja elektryczna','electricalSystem'),
        ('Stan akumulatora','batteryCondition'), ('Oświetlenie','lightsAll'),
        ('Wycieraczki','wipers'), ('Klakson','horn'),
        ('Jazda testowa','testDriveConducted'),
    ]
    story.append(_kv([[l, _t(mech.get(k))] for l, k in mech_items], fn, fnb))
    story.append(Spacer(1, 3*mm))

    # ─── USZKODZENIA ──────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("USZKODZENIA ZEWNĘTRZNE", S['section']))

    def _dmg_table(damage_list):
        if damage_list and isinstance(damage_list, list) and len(damage_list) > 0:
            rows = [['ELEMENT', 'TYP', 'ROZMIAR', 'OPIS', 'DZIAŁANIE']]
            for d in damage_list:
                if isinstance(d, dict):
                    rows.append([_s(d.get('part')), _s(d.get('type')), _s(d.get('size')),
                                 _s(d.get('description')), _s(d.get('action'))])
            dcw = [CONTENT_W*0.18, CONTENT_W*0.16, CONTENT_W*0.14, CONTENT_W*0.32, CONTENT_W*0.20]
            dt = Table(rows, colWidths=dcw)
            dt.setStyle(TableStyle(_ts(fn, fnb) + [
                ('BACKGROUND', (0,0), (-1,0), HEADER_BG),
                ('FONTNAME', (0,0), (-1,0), fnb),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ]))
            return dt
        return Paragraph("Brak uszkodzeń.", S['small'])

    story.append(_dmg_table(ext_dmg))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("USZKODZENIA WEWNĘTRZNE", S['section']))
    story.append(_dmg_table(int_dmg))
    story.append(Spacer(1, 3*mm))

    # ─── UWAGI I WYCENA ──────────────────────────────────────
    story.append(Paragraph("UWAGI I WYCENA", S['section']))
    nr = [
        ['Dowód rejestracyjny okazany', _t(notes.get('registrationDocPresented'))],
        ['Karta pojazdu okazana', _t(notes.get('vehicleCardPresented'))],
        ['Faktura zakupu okazana', _t(notes.get('purchaseInvoicePresented'))],
        ['Książka serwisowa okazana', _t(notes.get('serviceBookPresented'))],
        ['Zabezpieczenie antykradzieżowe', _t(notes.get('antiTheftSecurityPresented'))],
        ['Immobilizer sprawny', _t(notes.get('immobilizerWorking'))],
        ['Jazda testowa możliwa', _t(notes.get('testDrivePossible'))],
        ['Weryfikacja VIN', _s(notes.get('vinVerification'))],
        ['Uwagi wyceny', _s(notes.get('valuationNotes'))],
        ['Uwagi ogólne', _s(notes.get('generalComments'))],
        ['Wartość szacunkowa', _s(notes.get('estimatedValue'))],
        ['Porównanie rynkowe', _s(notes.get('marketComparison'))],
    ]
    story.append(_kv(nr, fn, fnb))
    story.append(Spacer(1, 5*mm))

    # ─── PODPISY ──────────────────────────────────────────────
    story.append(Paragraph("PODPISY", S['section']))
    story.append(Spacer(1, 3*mm))

    sig_cells = []
    for label, key in [('Podpis Rzeczoznawcy','signatureAppraiser'),
                        ('Podpis Klienta','signatureClient'),
                        ('Podpis Dysponenta','signatureYard')]:
        sig_b64 = summary.get(key, '')
        if sig_b64 and isinstance(sig_b64, str) and sig_b64.startswith('data:image'):
            try:
                img_data = base64.b64decode(sig_b64.split(',')[1])
                img_buf = io.BytesIO(img_data)
                sig_cells.append([Image(img_buf, width=5*cm, height=2*cm),
                                  Paragraph(label, S['siglabel'])])
            except Exception:
                sig_cells.append([Paragraph("________________", S['siglabel']),
                                  Paragraph(label, S['siglabel'])])
        else:
            sig_cells.append([Paragraph("________________", S['siglabel']),
                              Paragraph(label, S['siglabel'])])

    sig_data = [
        [sig_cells[0][0], sig_cells[1][0], sig_cells[2][0]],
        [sig_cells[0][1], sig_cells[1][1], sig_cells[2][1]],
    ]
    st = Table(sig_data, colWidths=[CONTENT_W/3]*3)
    st.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(st)

    # VIN + absent rep
    story.append(Spacer(1, 5*mm))
    vc = summary.get('vinConfirmed', False)
    story.append(Paragraph(f"VIN zweryfikowany: {'TAK ✓' if vc else 'NIE'}", S['small']))
    if summary.get('isAbsentRep'):
        story.append(Paragraph(f"Dysponent nieobecny. Komentarz: {_s(summary.get('absentRepComment'))}", S['small']))

    # Footer
    story.append(Spacer(1, 10*mm))
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    story.append(Paragraph(f"Raport wygenerowany: {now} | Zaufaj Rzeczoznawcy", S['footer']))

    doc.build(story)
    return buffer.getvalue()
