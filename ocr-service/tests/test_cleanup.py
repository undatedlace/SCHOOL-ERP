import pytest

from ocr.cleanup import clean, is_nullish, is_same_as_above


@pytest.mark.parametrize("text", ["N.A", "n/a", "NA", "-", "—", "Nil", "  ", "---"])
def test_nullish_answers_become_none(text):
    assert is_nullish(text)
    assert clean("text", text) == (None, True)


@pytest.mark.parametrize("text", ["15", "Mumbai", "No"])
def test_real_answers_are_not_nullish(text):
    assert not is_nullish(text)


@pytest.mark.parametrize(
    "raw, want",
    [
        ("04/08/2022", "04/08/2022"),
        ("4-8-22", "04/08/2022"),
        ("O4/O8/2O22", "04/08/2022"),
        ("4 August 2022", "04/08/2022"),
        ("04082022", "04/08/2022"),
        ("0711212026", "07/12/2026"),
        ("2410412026", "24/04/2026"),
    ],
)
def test_dates(raw, want):
    assert clean("date", raw) == (want, True)


def test_impossible_date_is_kept_but_invalid():
    value, valid = clean("date", "31/02/2022")
    assert not valid and value == "31/02/2022"


@pytest.mark.parametrize(
    "raw, want, valid",
    [
        ("98200 12345", "9820012345", True),
        ("+91 9820012345", "9820012345", True),
        ("O98200l2345", "9820012345", True),
        ("12345", "12345", False),
    ],
)
def test_phone(raw, want, valid):
    assert clean("phone", raw) == (want, valid)


@pytest.mark.parametrize(
    "raw, want",
    [
        ("wheelndeals102@yahoo.com", "wheelndeals102@yahoo.com"),
        ("Wheelndeals 102 @ yahoo.com", "wheelndeals102@yahoo.com"),
        ("imran12@gmial.com", "imran12@gmail.com"),
        ("imran12agmail.com", "imran12@gmail.com"),
    ],
)
def test_email(raw, want):
    assert clean("email", raw) == (want, True)


def test_money_and_year():
    assert clean("money", "Rs. 24,000/-") == ("24000", True)
    assert clean("year2", "2026") == ("26", True)


def test_vocab_snapping_keeps_both_languages():
    assert clean("text", "Urdu/Hindl", "languages") == ("Urdu/Hindi", True)
    assert clean("text", "Maharastra", "states") == ("Maharashtra", True)
    assert clean("text", "Musiim", "religions") == ("Muslim", True)


def test_names_are_upper_case_letters():
    assert clean("name", "memon 1") == ("MEMON", True)


def test_same_as_above():
    assert is_same_as_above("SAME AS ABOVE")
    assert is_same_as_above("Same as abov")
    assert not is_same_as_above("12, Noor Manzil, Jogeshwari")


def test_address_place_names_are_corrected():
    value, _ = clean("address", "31. Sana Tower, Patel Estate, Togeshwari (Ww), Mumhai - 400145")
    assert value == "31, Sana Tower, Patel Estate, Jogeshwari (W), Mumbai - 400145"
