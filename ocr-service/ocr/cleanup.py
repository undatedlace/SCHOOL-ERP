"""Clean-up rules: turn raw recognised text into a field value.

Most of the accuracy on handwriting comes from here, not from the model:
checking a value against its type (a phone number is 10 digits), fixing the
letter/digit mix-ups recognisers make (O for 0, l for 1), and snapping short
answers to known lists (religions, states, languages, months).

Each rule returns (value, valid). `valid` is False when the text could not be
made into a proper value of that type; the value is still returned so the
person checking the form sees what was read.
"""

from __future__ import annotations

import re
from datetime import date

from rapidfuzz import fuzz, process

NULLISH = {"na", "n a", "n/a", "nil", "none", "not applicable", "-", "--", "---", "nill", "no one"}

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

VOCABULARIES: dict[str, list[str]] = {
    "months": MONTHS,
    "states": [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
        "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
        "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
        "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh",
    ],
    "nationalities": ["Indian"],
    "religions": ["Muslim", "Islam", "Hindu", "Christian", "Sikh", "Jain", "Buddhist", "Parsi"],
    "languages": [
        "Urdu", "Hindi", "English", "Marathi", "Gujarati", "Arabic", "Bengali", "Tamil", "Telugu", "Kannada",
        "Malayalam", "Punjabi", "Konkani", "Sindhi", "Kutchi", "Memoni", "Bhojpuri", "Marwari",
    ],
}

# Place names near the school. Words in an address that are close to one of
# these are corrected (Togeshwari -> Jogeshwari); everything else is kept as read.
PLACES = [
    "Mumbai", "Jogeshwari", "Andheri", "Goregaon", "Malad", "Oshiwara", "Behram", "Baug", "Amrut", "Nagar",
    "Mominpura", "Gulshan", "Estate", "Road", "Building", "Apartment", "Apt", "Tower", "Manzil", "Chawl",
    "Society", "Near", "Opp", "Floor", "Room", "Flat", "West", "East", "Maharashtra", "Mahakali", "Caves",
    "Bandra", "Kurla", "Santacruz", "Vile", "Parle", "Borivali", "Kandivali", "Mira", "Bhayandar", "Thane",
]

# Letters recognisers confuse with digits, in fields that can only hold digits.
DIGIT_FIX = str.maketrans({
    "O": "0", "o": "0", "D": "0", "Q": "0", "U": "0",
    "I": "1", "l": "1", "i": "1", "|": "1", "!": "1", "]": "1", "[": "1", "/": "1",
    "Z": "2", "z": "2",
    "S": "5", "s": "5",
    "G": "6", "b": "6",
    "T": "7",
    "B": "8",
    "g": "9", "q": "9",
})

EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "yahoo.co.in", "hotmail.com", "rediffmail.com", "outlook.com", "icloud.com", "live.com"]
EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$")


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def is_nullish(text: str) -> bool:
    raw = squash(text)
    if re.search(r"\d", raw):
        return False
    t = squash(re.sub(r"[^a-z/\- ]", " ", raw.lower().replace(".", "")))
    return t == "" or t in NULLISH or re.fullmatch(r"[-_~=.\s]+", raw) is not None


def digits(text: str) -> str:
    return re.sub(r"\D", "", squash(text).replace(" ", "").translate(DIGIT_FIX))


def clean_digits(text: str) -> tuple[str | None, bool]:
    d = digits(text)
    return (d or None), bool(d)


def clean_phone(text: str) -> tuple[str | None, bool]:
    d = digits(text)
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    elif len(d) == 11 and d.startswith("0"):
        d = d[1:]
    if not d:
        return None, False
    mobile = len(d) == 10 and d[0] in "6789"
    landline = len(d) in (8, 10)
    return d, mobile or landline


def clean_money(text: str) -> tuple[str | None, bool]:
    t = re.sub(r"(?i)\brs\.?|₹|/-|inr", " ", squash(text))
    t = re.sub(r"(?<=\d)[,.](?=\d{3}\b)", "", t)  # 24,000 -> 24000
    d = digits(t)
    return (d or None), bool(d)


def clean_year2(text: str) -> tuple[str | None, bool]:
    d = digits(text)
    if len(d) == 4 and d.startswith("20"):
        d = d[2:]
    return (d or None), len(d) == 2


def _year(y: str) -> int | None:
    if len(y) == 4:
        return int(y)
    if len(y) == 2:
        n = int(y)
        return 2000 + n if n <= (date.today().year % 100) + 1 else 1900 + n
    return None


def clean_date(text: str) -> tuple[str | None, bool]:
    """Read day, month and year in that order; month may be written as a word."""
    t = squash(text)
    words = re.findall(r"[A-Za-z]{3,}", t)
    month_word = None
    for w in words:
        m = process.extractOne(w, MONTHS, scorer=fuzz.WRatio, score_cutoff=80)
        if m:
            month_word = MONTHS.index(m[0]) + 1
            t = t.replace(w, " ")
            break
    # Recognisers often read "/" as "1" or "l": 07/12/2026 comes back as 0711212026.
    run = re.sub(r"\s", "", t)
    m = re.fullmatch(r"(\d{1,2})[1l|](\d{1,2})[1l|](\d{4}|\d{2})", run)
    if m and month_word is None and len(digits(run)) in (9, 10) and not re.fullmatch(r"\d{8}", run):
        t = "/".join(m.groups())
    nums = [n for n in re.split(r"[^0-9A-Za-z|!]+", t) if n]
    nums = [digits(n) for n in nums]
    nums = [n for n in nums if n]
    if len(nums) == 1 and month_word is None and len(nums[0]) in (6, 8):  # 01032021 or 010321
        n = nums[0]
        nums = [n[:2], n[2:4], n[4:]]
    try:
        if month_word is not None and len(nums) >= 2:
            d, m, y = int(nums[0]), month_word, _year(nums[1])
        elif len(nums) >= 3:
            d, m, y = int(nums[0]), int(nums[1]), _year(nums[2])
        else:
            return (t or None), False
        if y is None:
            raise ValueError
        date(y, m, d)
        return f"{d:02d}/{m:02d}/{y:04d}", True
    except (ValueError, OverflowError):
        return (squash(text) or None), False


def clean_email(text: str) -> tuple[str | None, bool]:
    t = squash(text).lower().replace(" ", "")
    t = re.sub(r"\(at\)|\[at\]", "@", t)
    t = t.replace(",", ".").rstrip(".")
    if "@" not in t:
        # A recogniser often reads "@" as "a" or "Q"; look for a known domain.
        for dom in EMAIL_DOMAINS:
            name = dom.split(".")[0]
            i = t.rfind(name)
            if i > 1:
                t = t[: i - 1] + "@" + t[i:]
                break
    if "@" in t:
        local, _, domain = t.rpartition("@")
        m = process.extractOne(domain, EMAIL_DOMAINS, scorer=fuzz.ratio, score_cutoff=75)
        if m:
            domain = m[0]
        t = f"{local}@{domain}"
    return (t or None), bool(EMAIL_RE.match(t))


def clean_name(text: str) -> tuple[str | None, bool]:
    t = re.sub(r"[^A-Za-z .'-]", "", squash(text))
    t = squash(t).strip(" .-").upper()
    return (t or None), bool(re.search(r"[A-Z]{2}", t))


def snap(text: str, vocab: list[str], cutoff: int = 78) -> tuple[str, bool]:
    """Snap each part of 'Urdu/Hindi' to the list; keep the separator."""
    parts = re.split(r"\s*([/,&]|\band\b)\s*", squash(text))
    out, ok = [], True
    for p in parts:
        if p in ("/", ",", "&", "and") or not p:
            out.append(p)
            continue
        m = process.extractOne(p, vocab, scorer=fuzz.WRatio, score_cutoff=cutoff)
        if m:
            out.append(m[0])
        else:
            out.append(p)
            ok = False
    return "".join(out).replace(",", ", "), ok


def snap_places(text: str) -> str:
    def fix(m: re.Match) -> str:
        w = m.group(0)
        if len(w) < 4:
            return w
        hit = process.extractOne(w, PLACES, scorer=fuzz.ratio, score_cutoff=80)
        return hit[0] if hit else w

    return re.sub(r"[A-Za-z]+", fix, text)


def clean_address(text: str) -> tuple[str | None, bool]:
    t = squash(text)
    if not t:
        return None, False
    t = re.sub(r"\(\s*[wW]+\s*\)", "(W)", t)  # "(Ww)" -> "(W)"
    t = re.sub(r"\(\s*[eE]\s*\)", "(E)", t)
    t = re.sub(r"(?<=\d)\.\s", ", ", t)  # "31. Sana" -> "31, Sana"
    return snap_places(t), True


def clean_text(text: str, vocab: str | None = None) -> tuple[str | None, bool]:
    t = squash(text)
    if not t:
        return None, False
    if vocab:
        return snap(t, VOCABULARIES[vocab])
    return t, True


SAME_AS_ABOVE = ("same as above", "same as permanent", "same", "as above", "ditto")


def is_same_as_above(text: str) -> bool:
    t = squash(text).lower()
    return any(fuzz.ratio(t, s) >= 80 for s in SAME_AS_ABOVE)


def clean(ftype: str, text: str, vocab: str | None = None) -> tuple[str | None, bool]:
    """Apply the rule for a field type. Blank and 'N.A' answers become None."""
    if text is None or is_nullish(text):
        return None, True
    if ftype == "digits":
        return clean_digits(text)
    if ftype == "phone":
        return clean_phone(text)
    if ftype == "money":
        return clean_money(text)
    if ftype == "year2":
        return clean_year2(text)
    if ftype == "date":
        return clean_date(text)
    if ftype == "email":
        return clean_email(text)
    if ftype == "name":
        return clean_name(text)
    if ftype == "address":
        return clean_address(text)
    if ftype == "text":
        return clean_text(text, vocab)
    raise ValueError(f"no clean-up rule for {ftype}")
