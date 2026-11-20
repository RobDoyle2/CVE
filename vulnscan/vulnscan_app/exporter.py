"""Export the current filtered view to Excel (.xlsx) or PDF (A4)."""
import io
from datetime import datetime

COLUMNS = [("ID", "id", 20), ("Source", "source", 11), ("Exploited", "exploited", 10),
           ("Severity", "severity", 10), ("Score", "score", 7), ("Affected product", "affected", 40),
           ("Summary", "summary", 70), ("Published", "published", 11), ("Modified", "modified", 11),
           ("Link", "url", 45)]


def describe_filters(f):
    sev = {"critical": "critical only", "high": "critical and high", "all": "all severities"}.get(
        f.get("severity") or "high", "critical and high")
    parts = [f"last {int(f.get('days') or 7)} days", sev]
    if f.get("exploited_only"):
        parts.append("known exploited only")
    if f.get("source"):
        parts.append("source: " + f["source"])
    if f.get("q"):
        parts.append(f"search: \"{f['q']}\"")
    return ", ".join(parts)


def _cell(row, key):
    v = row.get(key)
    if key == "exploited":
        return "YES" if v else ""
    return "" if v is None else v


def to_xlsx(rows, summary, filters, title):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Vulnerabilities"
    header_fill = PatternFill("solid", fgColor="1F3A5F")
    exploited_fill = PatternFill("solid", fgColor="F8D7DA")
    critical_fill = PatternFill("solid", fgColor="FFF3CD")
    ws.append([c[0] for c in COLUMNS])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="center")
    for r in rows:
        ws.append([_cell(r, c[1]) for c in COLUMNS])
        i = ws.max_row
        fill = exploited_fill if r.get("exploited") else (critical_fill if r.get("severity") == "CRITICAL" else None)
        for cell in ws[i]:
            cell.alignment = Alignment(vertical="top", wrap_text=cell.column in (6, 7))
            if fill:
                cell.fill = fill
        if r.get("exploited"):
            ws.cell(i, 3).font = Font(bold=True, color="9B1C1C")
        if r.get("url"):
            link = ws.cell(i, len(COLUMNS))
            link.hyperlink = r["url"]
            link.font = Font(color="0563C1", underline="single")
    for idx, (_, _, width) in enumerate(COLUMNS, 1):
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLUMNS))}{max(1, ws.max_row)}"

    info = wb.create_sheet("Summary")
    for line in (
        [title + " report"],
        ["Generated", datetime.now().strftime("%Y-%m-%d %H:%M")],
        ["Records in database", summary["total"]],
        ["Rows in this report", len(rows)],
        ["Known exploited in this report", sum(1 for r in rows if r.get("exploited"))],
        ["Filters", describe_filters(filters)],
        [],
        ["Rows shaded red are known to be exploited in the wild. Rows shaded yellow are critical."],
    ):
        info.append(line)
    info["A1"].font = Font(bold=True, size=14)
    info.column_dimensions["A"].width = 32
    info.column_dimensions["B"].width = 60
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_pdf(rows, summary, filters, title, max_rows=3000):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle
    from xml.sax.saxutils import escape

    buf = io.BytesIO()
    page = landscape(A4)
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=10 * mm, rightMargin=10 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm, title=f"{title} report")
    ss = getSampleStyleSheet()
    small = ParagraphStyle("small", parent=ss["Normal"], fontSize=7, leading=8.4)
    small_b = ParagraphStyle("smallb", parent=small, fontName="Helvetica-Bold")
    head = ParagraphStyle("head", parent=small, textColor=colors.white, fontName="Helvetica-Bold")
    exploited = sum(1 for r in rows if r.get("exploited"))
    crit = sum(1 for r in rows if r.get("severity") == "CRITICAL")
    story = [
        Paragraph(escape(f"{title} report"), ss["Title"]),
        Paragraph(escape(f"Date: {datetime.now().strftime('%d %B %Y, %H:%M')}"), ss["Normal"]),
        Paragraph(escape(f"Records collected: {summary['total']:,}. In this report: {len(rows):,} "
                         f"exploited or critical/high ({exploited:,} known exploited, {crit:,} critical)."),
                  ss["Normal"]),
        Paragraph(escape("Filters: " + describe_filters(filters)), ss["Normal"]),
        Paragraph("Rows shaded red are known to be exploited in the wild - start with those.", ss["Normal"]),
        Spacer(1, 4 * mm),
    ]
    cols = [("ID", "id"), ("Source", "source"), ("Expl.", "exploited"), ("Severity", "severity"),
            ("Score", "score"), ("Affected product", "affected"), ("Summary", "summary"),
            ("Published", "published"), ("Modified", "modified")]
    widths = [30, 16, 11, 16, 12, 50, 102, 17, 17]
    data = [[Paragraph(c[0], head) for c in cols]]
    shown = rows[:max_rows]
    for r in shown:
        line = []
        for _, key in cols:
            v = _cell(r, key)
            if key == "summary":
                v = (str(v)[:300] + "…") if len(str(v)) > 300 else v
            if key == "id" and r.get("url"):
                line.append(Paragraph(f'<link href="{escape(r["url"])}" color="#0563C1">{escape(str(v))}</link>', small))
            else:
                line.append(Paragraph(escape(str(v)), small_b if key == "exploited" else small))
        data.append(line)
    table = LongTable(data, colWidths=[w * mm for w in widths], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F3A5F")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#BBBBBB")),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for i, r in enumerate(shown, 1):
        if r.get("exploited"):
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F8D7DA")))
        elif r.get("severity") == "CRITICAL":
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#FFF3CD")))
    table.setStyle(TableStyle(style))
    story.append(table)
    if len(rows) > max_rows:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(escape(f"Only the first {max_rows:,} of {len(rows):,} rows are included. "
                                      "Narrow the filters or use the Excel export for the full list."), ss["Normal"]))

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(page[0] - 10 * mm, 6 * mm, f"Page {d.page}")
        canvas.drawString(10 * mm, 6 * mm, f"{title} - public vulnerability data")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
