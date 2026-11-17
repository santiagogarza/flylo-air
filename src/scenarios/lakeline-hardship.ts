import type { ScenarioConfig } from './types';

export const LAKELINE_GREETING = 'Lakeline Auto Finance customer care. How can I help?';

export const LAKELINE_DEMO_LINE =
  "Hi, I'm Maya Chen, loan LAF-20417, maya.chen@example.com. I had a medical bill this month and need to push my payment back a few weeks. Afternoons are best to call me.";

const CATEGORIES = ['Payment extension', 'Due-date change', 'Payment plan', 'Payment portal problem', 'Other'] as const;

const FIELDS = [
  { label: 'Full name' },
  { label: 'Loan number' },
  { label: 'Email' },
  { label: 'Reason' },
  { label: 'Requested change' },
  { label: 'Best callback window' },
];

function lakelineInstructions(): string {
  return [
    'You are a customer care agent at Lakeline Auto Finance, a fictional auto lender. Keep every reply to one or two short, warm sentences. When fields are missing, ask for all of them in one short question, and do not list what you already have.',
    'The caller will often give their name, loan number, email, reason, the change they want, and a callback window in one breath. Save each field the moment you hear it. Do not ask them to repeat anything you already saved, and do not wait until the end of the call.',
    'Never mention software vendors, models, or that you are automated.',
    'Never promise an approval, a new due date, a payment plan, or any other outcome. You only write down the request.',
    'Reply in the language the caller is using right now. If they switch languages, switch with them for those sentences, then follow them back.',
    'Write every form field in English. Translate before you save a field.',
    'Record only what the caller actually said. Never guess a name, loan number, or email. Leave unknown fields empty.',
    'As soon as you know one field, call set_field for that field.',
    'Reason is cumulative. Whenever the caller adds a detail, call set_field for reason again with the full English reason so far, keeping every earlier detail.',
    'Loan numbers are the letters LAF, a hyphen, and five digits, for example LAF-20417. Save them in that form. If the caller omits the hyphen or says the letters separately, still save LAF- and the five digits.',
    'Save email addresses in lowercase with no spaces. Write a spoken "at" as @ and a spoken "dot" as a period.',
    `Fields: ${FIELDS.map((field) => field.label).join(', ')}.`,
    `Requested changes: ${CATEGORIES.join(', ')}. When the request clearly belongs to one, set requestedChange without asking. Pushing a payment back is Payment extension. Moving the day of the month is Due-date change. Splitting what is past due is Payment plan. A payment page that failed is Payment portal problem. Only ask when it is unclear.`,
    'When the required fields are filled, do not read them back. In one or two short sentences, say the form is filled in and ask the caller to check it and press Submit. You cannot submit the form. Do not promise an outcome.',
  ].join(' ');
}

export const lakelineHardship: ScenarioConfig = {
  id: 'lakeline-hardship',
  title: 'Request a payment change',
  brandName: 'Lakeline Auto Finance',
  brandColor: '#0f766e',
  brandColorDark: '#115e59',
  brandNavy: '#0b1f33',
  tagline: 'A sample auto lender. No real loans or payments. Nothing is sent until you press Submit.',
  pageEyebrow: 'Hardship request',
  ticketPrefix: 'LAF-REQ-',
  categories: CATEGORIES,
  categoryKey: 'requestedChange',
  summaryKey: 'reason',
  referenceKey: 'loanNumber',
  webhook: {
    urlEnv: 'LAKELINE_WEBHOOK_URL',
    keyEnv: 'LAKELINE_WEBHOOK_KEY',
    headerEnv: 'SUPPORT_WEBHOOK_HEADER',
  },
  categoryAliases: {
    'Payment extension': ['extension', 'defer', 'deferral', 'push back', 'push my payment'],
    'Due-date change': ['due date', 'duedate', 'change my due date'],
    'Payment plan': ['payment plan', 'installment'],
    'Payment portal problem': ['portal', 'website', 'payment failed', 'could not pay'],
    Other: ['other', 'something else'],
  },
  fields: [
    {
      key: 'fullName',
      label: 'Full name',
      type: 'text',
      required: true,
      maxLength: 120,
      normalize: 'trim',
      placeholder: 'Maya Chen',
      input: { autoComplete: 'name', spellCheck: false },
      messages: { required: 'Enter your full name.', maxLength: 'Use 120 characters or fewer.' },
    },
    {
      key: 'loanNumber',
      label: 'Loan number',
      type: 'text',
      required: true,
      maxLength: 40,
      placeholder: 'LAF-20417',
      example: 'LAF-20417',
      hint: 'Like LAF-20417. Spaces and capitalization are fine.',
      pattern: '^LAF-\\d{5}$',
      normalize: 'loan',
      input: { autoComplete: 'off', spellCheck: false, autoCapitalize: 'characters' },
      messages: {
        required: 'Enter a loan number like LAF-20417.',
        pattern: 'Enter a loan number like LAF-20417.',
      },
    },
    {
      key: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      full: true,
      maxLength: 254,
      placeholder: 'maya.chen@example.com',
      normalize: 'email',
      input: { autoComplete: 'email', spellCheck: false, inputMode: 'email' },
      messages: { required: 'Enter an email like name@example.com.', invalid: 'Enter an email like name@example.com.' },
    },
    {
      key: 'reason',
      label: 'Reason',
      type: 'textarea',
      required: true,
      full: true,
      rows: 4,
      minLength: 10,
      maxLength: 2000,
      normalize: 'trim',
      placeholder: 'What changed this month?',
      messages: {
        required: 'Tell us what happened in a sentence or two.',
        minLength: 'Tell us what happened in a sentence or two.',
        maxLength: 'Use 2,000 characters or fewer.',
      },
    },
    {
      key: 'requestedChange',
      label: 'Requested change',
      type: 'select',
      required: true,
      emptyOption: 'Select a change',
      messages: { required: 'Choose the change you need.', invalid: 'Choose the change you need.' },
    },
    {
      key: 'callbackWindow',
      label: 'Best callback window',
      type: 'text',
      required: true,
      maxLength: 120,
      normalize: 'trim',
      placeholder: 'Weekday afternoons',
      hint: 'When should we call you back?',
      input: { autoComplete: 'off' },
      messages: { required: 'Enter the best time to call you.' },
    },
  ],
  describe: (fields) =>
    `${fields.fullName} (loan ${fields.loanNumber}, ${fields.email}) requested ${fields.requestedChange}. Reason: ${fields.reason} Best callback window: ${fields.callbackWindow}.`,
  policyFile: 'src/scenarios/lakeline/hardship-policy.md',
  paymentPortal: {
    title: 'Make a payment',
    intro: 'Sample payment portal for Lakeline Auto Finance. A normal amount is recorded here. No card is charged.',
  },
  voice: {
    title: 'Lakeline Auto Finance',
    greeting: LAKELINE_GREETING,
    demoLine: LAKELINE_DEMO_LINE,
    instructions: lakelineInstructions(),
    keyterms: ['Lakeline', 'Lakeline Auto Finance', 'Maya Chen', 'LAF-20417', 'maya.chen@example.com'],
    valueDescription:
      'English text the caller actually said. Do not guess. For requestedChange, send one of the requested changes exactly. For reason, send the complete updated English reason, not only the newest detail. For loanNumber, send LAF- and five digits, for example LAF-20417.',
  },
  ui: {
    formTitle: 'Tell us what you need',
    formIntro:
      'Call customer care in this browser, or type your request. The form fills in while you talk. Unknown details stay blank and you can correct any field. Nothing is sent until you press Submit.',
    howEyebrow: 'How it works',
    howTitle: 'Talk, check, submit',
    steps: [
      'Press Call and allow the microphone.',
      'Say your name, loan number, email, and what you need changed.',
      'Watch the form fill in, fix anything, then press Submit.',
    ],
    callEyebrow: 'Call Lakeline Auto Finance',
    requiredNote: 'All fields are required.',
    transcriptEmpty: 'The conversation shows up here.',
    allFilled: 'All required fields are filled. Check them, then press Submit.',
    callLabel: 'Call Lakeline Auto Finance',
    hangUpLabel: 'Hang up',
    submitLabel: 'Submit',
    sendingLabel: 'Sending…',
    callAgainLabel: 'Call again',
    inCallNote: 'Press Esc to hang up.',
    idleNote: 'Nothing is sent until you press Submit.',
    sendErrorTitle: 'Your request could not be sent right now.',
    sendErrorBody: 'Check your connection and press Submit again.',
    invalidTitle: 'Check the highlighted fields, then press Submit again.',
    successEyebrow: 'Hardship request',
    successTitle: 'Request received',
    successHint: 'Quote this number if you contact us again.',
    restartLabel: 'Start a new request',
    filledTag: 'Filled from call',
    formId: 'intake-form',
    titleId: 'intake-form-title',
    fieldIdPrefix: 'intake',
    receivedId: 'request-received',
    showDemoLine: true,
    portalLink: { href: '/intake/pay?scenario=lakeline-hardship', label: 'Make a payment' },
    successMessage: (values) => {
      const first = values.fullName.trim().split(' ')[0] || 'there';
      const email = values.email.trim();
      return `Thanks, ${first}. Lakeline Auto Finance will email ${email} about this request. Submitting does not approve a change.`;
    },
  },
};
