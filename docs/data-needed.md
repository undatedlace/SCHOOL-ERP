# What the school needs to give us

Photos are fine for the paper items, as long as they are sharp and show the whole page.
Last updated 10 Nov 2026.

## Paper documents (PDF or photo)

1. **Report card:** one filled-in card (names blanked is fine) and one blank, for each stage the school uses (for example Nursery to Std 2, if the layouts differ).
2. **Fee receipt:** the book or sheet the accountant uses today (school name, receipt number format, signature area).
3. **Fee circular or fee chart:** the page parents are given showing what each class pays.
4. **Letterhead and logo:** a high-resolution logo, for receipts, report cards and the app icon.
5. **Exam papers and mark sheets:** a sample of how marks are written down and totalled today.
6. **Attendance register page:** a sample from the current paper register, for students and, if one exists, for staff.
7. **Academic calendar:** the year's holidays, exam dates, parent meetings and events (annual day, sports day), so they can be loaded into the Calendar.
8. **The final admission form:** confirm that the paper form we copied is the one in use this year.

## Excel files (real data is best; fake names are fine if the columns are real)

1. **Students:** one row per child. Admission number, name, gender, date of birth, class and division, joining date, mobile numbers, address.
2. **Guardians:** father, mother and others, with mobile numbers. Note which students are siblings.
3. **Staff:** employee number, name, designation, mobile, email, joining date, and those who have left with their leaving date.
4. **Classes and divisions:** the list the school runs this year, in order.
5. **Subjects:** the subject list for each class.
6. **Teaching assignments:** who is class teacher of which division, and who teaches which subject in which division.
7. **Opening balances:** what each family owes today, student by student, with the amount and the year it relates to.
8. **Fee structure:** per class, the amount for each kind of fee (tuition, admission, annual and so on).
9. **Past payments:** only if history should be brought over (date, amount, mode, receipt number). Opening balances alone are enough to start.

## Answers we need

- **Board and grading:** which board (State, CBSE or ICSE); whether marks are numbers, grades or remarks; grade bands and pass marks; how many exams there are in a year (for example term 1, term 2, final).
- **Fee rules:** instalment dates and percentages; late fee, if any; who approves concessions; which payment modes are accepted; whether a registration or admission fee is taken at admission.
- **Student attendance:** daily or per period; who takes it; how far back a teacher may correct it (we assumed 7 days); what percentage counts as low (we assumed 75%).
- **Staff attendance (new):** how teachers will be recorded. Options: the admin marks by hand (built now), teachers log in and out of the app, biometric, or a QR code at the gate. School start time and when someone counts as late.
- **Leave (new):** is leave just "the admin marks on leave", or must a parent or teacher apply and the admin approve? Which kinds of leave exist for staff, and how many days a year?
- **Admission rules:** whether the age limits are strict or only advice; whether parents will ever apply online.
- **Promotion:** whether children are ever held back in Nursery to Std 2; whether roll numbers are used at all.
- **People and roles (new):** who will be the admin, who is in the front office, who is the accountant (names and mobile numbers, for the first logins).
- **Messages to parents (new):** whether SMS or WhatsApp is wanted. They are not in V1; notices and calendar events are shown inside the app.
- **Data protection:** how long records are kept and whether parents sign a consent. Check with a qualified adviser before launch.

## Technical items

- **S3 bucket and key:** see `docs/s3-setup.md`; put the settings in `api/.env` and run `npm run s3:check`.
- **Hosting:** which provider and region, and whether the school has a domain name.
- **Virus scanning of uploads:** ClamAV (or the host's scanner) before launch.
