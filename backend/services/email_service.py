"""
Email Service
=============
Send HTML email notifications via SMTP (Gmail or any provider).
"""

import warnings
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")

import os
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("services.email")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@zaufajrzeczoznawcy.pl")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Zaufaj Rzeczoznawcy")

# Genitive month names for Polish date formatting ("4 maja 2026").
POLISH_MONTHS = [
    "", "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
]


def _format_polish_datetime(raw) -> str:
    """Format a planned-date value for the assignment email.

    '2026-05-04T09:00:00+03:00' -> '4 maja 2026, 09:00'
    '2026-05-04'                -> '4 maja 2026'
    empty / None                -> 'Do ustalenia'
    unparseable                 -> returned unchanged (e.g. 'Nie ustalono')
    """
    if raw is None or not str(raw).strip():
        return "Do ustalenia"
    s = str(raw).strip()
    from datetime import datetime
    has_time = "T" in s or ":" in s
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if has_time:
            return f"{dt.day} {POLISH_MONTHS[dt.month]} {dt.year}, {dt.hour:02d}:{dt.minute:02d}"
        return f"{dt.day} {POLISH_MONTHS[dt.month]} {dt.year}"
    except (ValueError, IndexError):
        pass
    try:
        dt = datetime.strptime(s[:10], "%Y-%m-%d")
        return f"{dt.day} {POLISH_MONTHS[dt.month]} {dt.year}"
    except (ValueError, IndexError):
        return s


async def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send email via SMTP. Returns True if successful."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — email not sent")
        return False

    try:
        import aiosmtplib

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info(f"✅ Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"❌ Email failed to {to_email}: {e}")
        return False


async def send_assignment_email(
    inspector_name: str,
    inspector_email: str,
    order_title: str,
    order_id: str,
    client_name: str = "",
    inspection_address: str = "",
    inspection_date: str = "",
    vehicle_make: str = "",
    vehicle_model: str = "",
    registration_plates: str = "",
) -> bool:
    """Send order assignment notification to inspector."""

    vehicle_info = f"{vehicle_make} {vehicle_model}".strip()
    plates_info = f" ({registration_plates})" if registration_plates else ""
    subject = f"Zlecenie #{order_id} — {vehicle_info}{plates_info}" if vehicle_info else f"Nowe zlecenie oględzin — {order_title}"

    # Display fallbacks: never render a bare "-" — show "Brak danych" instead.
    _BRAK = "Brak danych"
    order_no_display = (str(order_id).strip() or str(order_title).strip() or _BRAK)
    client_display = (client_name or "").strip() or _BRAK
    address_display = (inspection_address or "").strip() or _BRAK
    vehicle_display = vehicle_info or _BRAK
    plates_display = (registration_plates or "").strip() or _BRAK
    date_display = _format_polish_datetime(inspection_date)

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{ background: #1e40af; color: white; padding: 24px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 22px; }}
        .header p {{ margin: 4px 0 0; opacity: 0.8; font-size: 14px; }}
        .body {{ padding: 24px; }}
        .greeting {{ font-size: 16px; color: #333; margin-bottom: 16px; }}
        .card {{ background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0; }}
        .card-title {{ font-weight: bold; font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin-bottom: 12px; }}
        .field {{ display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }}
        .field:last-child {{ border-bottom: none; }}
        .field-label {{ color: #64748b; font-size: 14px; }}
        .field-value {{ color: #1e293b; font-weight: bold; font-size: 14px; }}
        .cta {{ text-align: center; margin: 24px 0; }}
        .cta a {{ background: #1e40af; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; }}
        .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔍 Nowe Zlecenie Oględzin</h1>
          <p>Zaufaj Rzeczoznawcy</p>
        </div>
        <div class="body">
          <p class="greeting">Cześć <strong>{inspector_name}</strong>,</p>
          <p style="color:#555;">Zostałeś przypisany do nowego zlecenia oględzin pojazdu. Szczegóły poniżej:</p>

          <div class="card">
            <div class="card-title">📋 Informacje o zleceniu</div>
            <div class="field">
              <span class="field-label">Nr zlecenia</span>
              <span class="field-value">{order_no_display}</span>
            </div>
            <div class="field">
              <span class="field-label">Klient</span>
              <span class="field-value">{client_display}</span>
            </div>
            <div class="field">
              <span class="field-label">Adres oględzin</span>
              <span class="field-value">{address_display}</span>
            </div>
            <div class="field">
              <span class="field-label">Planowana data</span>
              <span class="field-value">{date_display}</span>
            </div>
          </div>

          <div class="card">
            <div class="card-title">🚗 Pojazd</div>
            <div class="field">
              <span class="field-label">Marka / Model</span>
              <span class="field-value">{vehicle_display}</span>
            </div>
            <div class="field">
              <span class="field-label">Nr rejestracyjny</span>
              <span class="field-value">{plates_display}</span>
            </div>
          </div>

          <div class="cta">
            <a href="https://app.zaufajrzeczoznawcy.pl">Otwórz aplikację PWA</a>
          </div>

          <p style="color:#888; font-size:13px; text-align:center;">
            Zaloguj się używając swojego numeru telefonu i PIN-u aby zobaczyć szczegóły zlecenia.
          </p>
        </div>
        <div class="footer">
          <p>© 2026 Zaufaj Rzeczoznawcy Sp. z o.o.</p>
          <p>Ta wiadomość została wysłana automatycznie — prosimy nie odpowiadać.</p>
        </div>
      </div>
    </body>
    </html>
    """

    return await send_email(inspector_email, subject, html_body)
