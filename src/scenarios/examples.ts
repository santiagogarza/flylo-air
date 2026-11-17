/**
 * Sample variants. These are not registered and do not appear at /intake.
 * A new customer variant is one config file, one Grok Bot, and that bot's webhook routine.
 *
 * Copy lakeline-hardship.ts, then change the brand, fields, greeting, demo line, and webhook env names.
 * Point the bot's webhook routine URL at <NAME>_WEBHOOK_URL and its sender key at <NAME>_WEBHOOK_KEY.
 * Keep the header name in SUPPORT_WEBHOOK_HEADER.
 *
 * University student support
 *   id: university-support
 *   brandName: Northline University
 *   ticketPrefix: UNI-SUP-
 *   greeting: "Northline University support. How can I help?"
 *   fields: full name, student id (pattern ^STU-\d{6}$, normalizer of your own), email, category, description
 *   categories: Financial aid, Registration, Housing, Other
 *   webhook: { urlEnv: "UNIVERSITY_WEBHOOK_URL", keyEnv: "UNIVERSITY_WEBHOOK_KEY", headerEnv: "SUPPORT_WEBHOOK_HEADER" }
 *
 * Insurance claim
 *   id: insurance-claim
 *   brandName: Harbor & Pine Mutual
 *   ticketPrefix: INS-CLM-
 *   greeting: "Harbor and Pine support. How can I help?"
 *   fields: full name, policy number, email, date of loss, category, description
 *   categories: Auto, Home, Health, Other
 *   webhook: { urlEnv: "INSURANCE_WEBHOOK_URL", keyEnv: "INSURANCE_WEBHOOK_KEY", headerEnv: "SUPPORT_WEBHOOK_HEADER" }
 *
 * Medical appointment
 *   id: clinic-appointment
 *   brandName: Cedar Street Clinic
 *   ticketPrefix: CLN-APT-
 *   greeting: "Cedar Street Clinic support. How can I help?"
 *   fields: full name, date of birth, email, preferred day, category, reason
 *   categories: New visit, Follow-up, Billing, Other
 *   webhook: { urlEnv: "CLINIC_WEBHOOK_URL", keyEnv: "CLINIC_WEBHOOK_KEY", headerEnv: "SUPPORT_WEBHOOK_HEADER" }
 */
export {};
