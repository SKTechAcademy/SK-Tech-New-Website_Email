// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.head.innerHTML = "";
  document.body.innerHTML = '<div data-consent-banner hidden><button data-consent-accept>Allow</button><button data-consent-decline>Decline</button></div>';
  window.dataLayer = [];
});

test('tag waits for consent, uses supported command format and removes URL capabilities', async () => {
  const analytics = await import('./analytics');
  analytics.initAnalyticsConsent();
  analytics.configureAnalytics('G-TEST1234');
  expect(document.querySelector('script')).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-consent-accept]')!.click();
  expect(document.querySelector('script')!.src).toContain('G-TEST1234');
  const commands = window.dataLayer as IArguments[];
  expect(Object.prototype.toString.call(commands[0])).toBe('[object Arguments]');
  expect(commands[1]![2].page_location).not.toMatch(/[?#]/);
  expect(commands[1]![2].page_referrer).toBe('');
});

test('consent withdrawal disables the loaded tag and filters personal event fields', async () => {
  const analytics = await import('./analytics');
  analytics.initAnalyticsConsent();
  analytics.configureAnalytics('G-TEST1234');
  document.querySelector<HTMLButtonElement>('[data-consent-accept]')!.click();
  analytics.track('section_view', {section:'register',email:'private@example.com',skId:'SK1'});
  expect((window.dataLayer.at(-1) as IArguments)[2]).toEqual({section:'register'});
  document.querySelector<HTMLButtonElement>('[data-consent-decline]')!.click();
  expect((window as unknown as Record<string, unknown>)['ga-disable-G-TEST1234']).toBe(true);
  const count = window.dataLayer.length;
  analytics.track('section_view', {section:'interviews'});
  expect(window.dataLayer).toHaveLength(count);
});
