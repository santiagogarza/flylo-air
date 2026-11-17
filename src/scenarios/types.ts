export type NamedNormalizer = 'trim' | 'email' | 'booking' | 'loan';

/** A built-in normalizer name, or a function for a one-off scenario. */
export type FieldNormalizer = NamedNormalizer | ((value: string) => string);

export type ScenarioFieldInput = {
  autoComplete?: string;
  spellCheck?: boolean;
  autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
};

export type ScenarioField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'textarea' | 'select';
  required: boolean;
  /** Shown inside an empty control. */
  placeholder?: string;
  /** Empty option label for a select. */
  emptyOption?: string;
  /** Select options. Category fields use the scenario category list when this is omitted. */
  options?: readonly string[];
  /** Regular expression tested after normalization. */
  pattern?: string;
  /** Shown in the pattern error and as the format example. */
  example?: string;
  /** Always-visible helper under the control. */
  hint?: string;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  /** Runs before the pattern check, including voice fills. */
  normalize?: FieldNormalizer;
  full?: boolean;
  input?: ScenarioFieldInput;
  messages?: {
    required?: string;
    invalid?: string;
    pattern?: string;
    minLength?: string;
    maxLength?: string;
  };
};

export type ScenarioWebhook = {
  /** Env var that holds the webhook URL. Never a URL. */
  urlEnv: string;
  /** Env var that holds the sender key. Never the key itself. */
  keyEnv: string;
  /** Env var that holds the header name. Never a secret. */
  headerEnv: string;
};

export type ScenarioVoice = {
  /** Transcript speaker name and in-call heading. */
  title: string;
  /** Spoken as soon as the call connects. */
  greeting: string;
  /** Line the presenter can read in one breath. */
  demoLine: string;
  /** Omit to use the FlyLo-Air support instructions. */
  instructions?: string;
  keyterms?: readonly string[];
  /** Tool hint for set_field. Omit on FlyLo so the original sentence is kept. */
  valueDescription?: string;
};

export type ScenarioUi = {
  formTitle: string;
  formIntro: string;
  howEyebrow: string;
  howTitle: string;
  steps: readonly [string, string, string];
  callEyebrow: string;
  requiredNote: string;
  transcriptEmpty: string;
  allFilled: string;
  callLabel: string;
  hangUpLabel: string;
  submitLabel: string;
  sendingLabel: string;
  callAgainLabel: string;
  inCallNote: string;
  idleNote: string;
  sendErrorTitle: string;
  sendErrorBody: string;
  invalidTitle: string;
  successEyebrow: string;
  successTitle: string;
  successHint: string;
  restartLabel: string;
  filledTag: string;
  formId: string;
  titleId: string;
  fieldIdPrefix: string;
  receivedId: string;
  showDemoLine?: boolean;
  portalLink?: { href: string; label: string };
  successMessage: (fields: Record<string, string>) => string;
};

export type PaymentPortal = {
  title: string;
  intro: string;
};

export type ScenarioConfig = {
  id: string;
  title: string;
  brandName: string;
  brandColor: string;
  brandColorDark?: string;
  brandNavy?: string;
  tagline?: string;
  pageEyebrow?: string;
  fields: ScenarioField[];
  categories: readonly string[];
  /** Field whose value is copied to the ticket `category`. */
  categoryKey: string;
  /** Field used as the short text in `summary`. */
  summaryKey: string;
  /** Field shown in parentheses in `summary`, such as a loan number. */
  referenceKey?: string;
  /**
   * FlyLo /support payload: top-level fields, no `scenario` key.
   * The form and the ticket route both keep that shape.
   */
  legacyPayload?: boolean;
  ticketPrefix: string;
  webhook?: ScenarioWebhook;
  voice: ScenarioVoice;
  ui: ScenarioUi;
  /** Optional spoken aliases for the category field. */
  categoryAliases?: Record<string, readonly string[]>;
  describe?: (fields: Record<string, string>) => string;
  paymentPortal?: PaymentPortal;
  /** Repo-relative markdown rendered at /intake/policy. */
  policyFile?: string;
  /** Repo-relative JSON array of sample review cases. */
  sampleCasesFile?: string;
};
