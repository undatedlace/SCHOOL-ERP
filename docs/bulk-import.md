# Excel imports

Bringing data in from Excel: new and old admission forms, fees billed and paid, and attendance registers. Built 13 Nov 2026 (branch `feature/bulk-import`).

## How every import works

1. **Download the template** from the page the data belongs to (*Import from Excel*). The app builds it from its own data: the published admission form, the classes and divisions, the students enrolled in a year, the staff working in a month.
2. **Fill it in.** The first sheet, *How to fill*, explains the columns. Drop-downs offer the allowed choices. Grey columns come from the app and should not be changed.
3. **Upload it.** Nothing is saved yet: every row is checked and the screen shows a report (ready, to look at, errors, already in the app).
4. **Import.** The rows that passed go in, one at a time, so one bad row never undoes the others. A file can be imported only once; a second press, or a second person, is refused.
5. **Fix the rest.** *Download rows to fix* hands back the rows that did not go in, in the same template, with an *Error* column. Fix them and upload that file.

Every upload is kept under *Settings, Excel imports* (who, when, what went in, the rows to fix). A checked file waits a day for *Import*. Records that came in this way carry the batch (`import_batch_id` on applications, fee invoices and payments; `source = IMPORT` on staff attendance), and each import is audited (`imports.run`, plus `admissions.imported` and `fees.imported` per row).

**Limits:** one `.xlsx` file of up to 5 MB and 2,000 rows (split bigger files). Old `.xls` and CSV files are refused. A template made for another school, another kind of import, or something that is not our template is refused with a plain message. Headings may be reworded: the columns are matched by a hidden key row.

**Who:** the same people who do the work by hand. Admissions needs `admissions.manage` and `students.manage` (admitting makes a student). Fees needs `fees.structure.manage` and `fees.payment.create`. Student attendance needs `attendance.mark`, with the same division and 7-day rules as marking on the screen. Staff attendance needs `staff_attendance.manage`. No new permissions were added.

## Admission applications

One row per paper form. The columns are the published admission form's questions (photos and documents are left out and added later on the page; repeating questions such as siblings get three sets of columns), plus:

| Column | Meaning |
|---|---|
| Form no | As printed on the form; blank gives the next number for that year |
| Date received *, Academic year * | As on the form |
| Status, Decision date, Decision note | Blank status is Received; a refusal needs a reason; a decision date defaults to the date received |
| Admitted as a student? | Yes when the child joined (only for Granted). Blank means yes if a class is filled in |
| Admission no / student ID | Blank gives the next ID by the school's convention |
| Joined on | Blank is the start of the year (or the decision date, if later) |
| Father's, mother's, guardian's mobile; Primary contact | Names come from the form; mobiles default to the family mobile |
| Class & division in *each year* | The class the child was in that year, from the year they joined up to now |
| Left school on | When the child has left |

What the import makes for an admitted child: the application (with its real received and decision dates), the student, the guardians (a parent of two children is one person: the same name and mobile), and **one enrolment per year studied**, closed at each year's end the way year-end promotion does, the last one closed on the leaving date. So yearly counts and insights are right for old years too.

Checks: the dates, the form's own rules (required answers, choices), numbers used twice (in the app or the file), the division belongs to the class applied for, classes never go down (staying in the same class is a warning), no gap between years, a leaving date inside the last year with a class. Warnings (not blocking): the same name and date of birth already in the app or twice in the file, and the age advice. If the admission form is published again between the check and the import, the import is refused and the file must be uploaded again.

**One old form by hand:** *New application* (with the date received), then the decision with its real date (the decision dialog now takes `decidedOn`), then *Admit* with *Joined on*.

## Fees billed and paid

One sheet per academic year (or every year so far), one row per student enrolled that year: *Billed* (the year's fees after any concession), *Paid so far*, *Due* (an Excel formula, for information), *Last paid on*, *Mode*, *Reference*, *Note*.

The import makes the year's bill (one line, "Fees billed (imported)", due on the class's first due date or the year's first day) and records what was paid as **one payment allocated to that bill, dated *Last paid on*, with a receipt in the series of the year it was paid in** (not always the current year, as a payment taken at the counter is). Old receipt numbers go in *Reference*. Earlier dues carry forward by themselves, because the balance is always worked out from the ledger.

Safe to repeat: the template shows what is already in the app, and those rows are skipped. A year already billed at a different amount, or already holding payments, is refused (change it on the student's page). Paid more than billed is refused.

**One student by hand:** *Past year's fees* on the student's Fees section, the same rules.

## Attendance registers

Like the paper register: people down the side, the days across, **P**, **A**, **L** or **LV** in each box. Marks already in the app are filled in. **A blank box never removes a mark.** Grey boxes cannot be marked (not in the division that day, before joining, after leaving, a future day); Sundays and staff holidays are shaded lightly.

- **Students:** one sheet per division for a month (one division, or all the person may mark). The same rules as the screen: only students in that division on that day; a teacher only their own divisions and the last 7 days (a box left as it was is never refused).
- **Staff:** one sheet for the month. Approved leave is filled in as LV; leaving it keeps the leave as the reason, and a different mark replaces it (a warning says so).

## Not done

- Photos and scanned documents in the admission import.
- Concessions, opening balances and individual past payments in the fees file (only the yearly totals).
- Notes per day in the attendance registers; deleting marks from a file.
- A background job for very large files (imports run in the request; 2,000 rows is the cap).
- Opening the templates in Excel itself has not been tried yet: they were tested by reading them back with the same library (exceljs) in the end-to-end tests.
