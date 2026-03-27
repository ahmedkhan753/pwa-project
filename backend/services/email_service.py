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
        .field {{ display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; }}
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
              <span class="field-value">{order_title}</span>
            </div>
            <div class="field">
              <span class="field-label">Klient</span>
              <span class="field-value">{client_name or '—'}</span>
            </div>
            <div class="field">
              <span class="field-label">Adres oględzin</span>
              <span class="field-value">{inspection_address or '—'}</span>
            </div>
            <div class="field">
              <span class="field-label">Planowana data</span>
              <span class="field-value">{inspection_date or 'Do ustalenia'}</span>
            </div>
          </div>

          <div class="card">
            <div class="card-title">🚗 Pojazd</div>
            <div class="field">
              <span class="field-label">Marka / Model</span>
              <span class="field-value">{vehicle_make or '—'} {vehicle_model or ''}</span>
            </div>
            <div class="field">
              <span class="field-label">Nr rejestracyjny</span>
              <span class="field-value">{registration_plates or '—'}</span>
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
