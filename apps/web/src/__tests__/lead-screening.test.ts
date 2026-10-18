import {
  screenLeadSubmission,
  MIN_DWELL_MS,
  LEAD_HONEYPOT_FIELD,
  LEAD_TIMESTAMP_FIELD,
} from '@/lib/marketing/lead-screening';

const NOW = 1_000_000_000_000;

describe('screenLeadSubmission', () => {
  it('flags a filled honeypot as a bot', () => {
    expect(screenLeadSubmission({ honeypot: 'http://spam.example', loadedAt: String(NOW - 60_000) }, NOW)).toEqual({
      botLike: true,
      signal: 'honeypot',
    });
  });

  it('ignores an empty or whitespace honeypot', () => {
    expect(screenLeadSubmission({ honeypot: '', loadedAt: String(NOW - 60_000) }, NOW).botLike).toBe(false);
    expect(screenLeadSubmission({ honeypot: '   ', loadedAt: String(NOW - 60_000) }, NOW).botLike).toBe(false);
  });

  it('flags a submission completed faster than a human can', () => {
    const result = screenLeadSubmission({ loadedAt: String(NOW - (MIN_DWELL_MS - 1)) }, NOW);
    expect(result).toEqual({ botLike: true, signal: 'too_fast' });
  });

  it('accepts a submission with an adequate dwell time', () => {
    expect(screenLeadSubmission({ loadedAt: String(NOW - (MIN_DWELL_MS + 5_000)) }, NOW).botLike).toBe(false);
  });

  it('is non-breaking: a submission with no screening fields is not blocked', () => {
    expect(screenLeadSubmission({}, NOW)).toEqual({ botLike: false });
  });

  it('ignores a garbage or future timestamp rather than blocking a real user', () => {
    expect(screenLeadSubmission({ loadedAt: 'not-a-number' }, NOW).botLike).toBe(false);
    expect(screenLeadSubmission({ loadedAt: String(NOW + 10_000) }, NOW).botLike).toBe(false); // clock skew
  });

  it('honeypot takes precedence over a slow-enough dwell', () => {
    expect(screenLeadSubmission({ honeypot: 'x', loadedAt: String(NOW - 60_000) }, NOW).signal).toBe('honeypot');
  });

  it('exports stable field names the form and route agree on', () => {
    expect(LEAD_HONEYPOT_FIELD).toBe('homepageUrl');
    expect(LEAD_TIMESTAMP_FIELD).toBe('formLoadedAt');
  });
});
