# Lakeline Auto Finance: Hardship Policy (MOCK, demo only)

Applies to requests for a payment extension (deferral) or a due-date change. Evaluate in this order.

## §1. Compliance stops

Always first. The compliance bot owns these. Force ESCALATE, no decision on the merits, if any of these is true from the loan flags or the caller's words:
- Active-duty military or SCRA protections mentioned or flagged.
- Bankruptcy filed or mentioned.
- The caller disputes the debt, a fee, or a payment record.
- The caller asks us to stop contacting them (cease-contact).
- The account is not open (paid off, charged off, closed) or the loan number is not found.

## §2. Extension eligibility

Defer one payment to the end of the term. All must be true:
- Account is under 60 days past due.
- At least 6 on-time payments in total.
- Fewer than 2 extensions granted in the last 12 months (max 2 per rolling 12 months).
Decision: APPROVE_EXTENSION (one month deferred; interest continues to accrue).

## §3. Due-date change
- Allowed once per 12 months if the account is current or under 30 days past due and has at least 6 on-time payments.
- New due day must be between the 1st and the 28th.
Decision: APPROVE_DUE_DATE_CHANGE.

## §4. Payment plan
If the account is under 60 days past due but fails an extension rule (already 2 extensions, or fewer than 6 on-time payments):
Decision: OFFER_PAYMENT_PLAN (split the past-due amount across the next 3 payments; no new fees).

## §5. Escalate
Anything 60+ days past due, or anything not covered above: ESCALATE to a human hardship specialist.

## §6. Required disclosures

Required in every customer reply:
1. "This is a summary of your request. Final terms are confirmed in writing."
2. For extensions: "Interest continues to accrue during the deferred period, and your loan term will extend by one month."
3. For payment plans: "Missing a plan payment may end the plan and resume normal collection activity."
4. Sign off as "Lakeline Auto Finance Customer Care" with the mock line 1-800-555-0142.
Tone: plain, warm, no blame, no threats, no legal advice, no promises beyond the decision.
