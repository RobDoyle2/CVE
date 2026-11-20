# PyInstaller recipe: builds one double-click program with Python included.
#   pyinstaller --noconfirm packaging/vulnscan.spec
import sys
from pathlib import Path

ROOT = Path(SPECPATH).parent
icon = str(ROOT / "packaging" / "icon.ico") if sys.platform == "win32" else None

a = Analysis(
    [str(ROOT / "run.py")],
    pathex=[str(ROOT)],
    datas=[(str(ROOT / "vulnscan_app" / "static"), "vulnscan_app/static")],
    hiddenimports=["segno", "openpyxl", "reportlab.graphics.barcode.common",
                   "reportlab.graphics.barcode.code128", "reportlab.graphics.barcode.code93",
                   "reportlab.graphics.barcode.code39", "reportlab.graphics.barcode.usps",
                   "reportlab.graphics.barcode.usps4s", "reportlab.graphics.barcode.ecc200datamatrix"],
    excludes=["tkinter", "pytest", "numpy"],  # Pillow is needed by the PDF writer
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="VulnScan",
    console=False,          # no black terminal window
    icon=icon,
    version=str(ROOT / "packaging" / "version_info.txt") if sys.platform == "win32" else None,
    upx=False,
)
