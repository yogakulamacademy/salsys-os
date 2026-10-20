<?php
/**
 * Plugin Name: Salsys Tracking
 * Description: Installs the Salsys Universal Tracking browser SDK and optional consent UI on WordPress without creating a separate tracking engine.
 * Version: 1.0.0
 * Author: SalsysOS
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Salsys_Tracking_Plugin {
    const VERSION = '1.0.0';
    const OPTION_KEY = 'salsys_tracking_settings_v1';
    const PAGE_SLUG = 'salsys-tracking';

    public static function init() {
        add_action('admin_menu', array(__CLASS__, 'register_admin_page'));
        add_action('admin_init', array(__CLASS__, 'register_settings'));
        add_action('wp_head', array(__CLASS__, 'render_tracking_loader'), 2);
    }

    public static function defaults() {
        return array(
            'enabled' => '1',
            'api_base' => 'https://salsysos.com',
            'consent_mode' => 'required',
            'show_consent_ui' => '1',
            'brand' => get_bloginfo('name') ?: 'Website',
            'privacy_policy_url' => '',
            'cookie_policy_url' => '',
            'lead_form_selectors' => '',
            'debug' => '0',
        );
    }

    public static function settings() {
        $saved = get_option(self::OPTION_KEY, array());
        return wp_parse_args(is_array($saved) ? $saved : array(), self::defaults());
    }

    public static function register_admin_page() {
        add_options_page(
            'Salsys Tracking',
            'Salsys Tracking',
            'manage_options',
            self::PAGE_SLUG,
            array(__CLASS__, 'render_admin_page')
        );
    }

    public static function register_settings() {
        register_setting(
            'salsys_tracking_settings_group',
            self::OPTION_KEY,
            array(
                'type' => 'array',
                'sanitize_callback' => array(__CLASS__, 'sanitize_settings'),
                'default' => self::defaults(),
            )
        );
    }

    public static function sanitize_settings($input) {
        $input = is_array($input) ? $input : array();
        $defaults = self::defaults();

        $api_base = isset($input['api_base']) ? esc_url_raw(trim((string) $input['api_base'])) : $defaults['api_base'];
        if (!$api_base || stripos($api_base, 'https://') !== 0) {
            $api_base = $defaults['api_base'];
        }

        $consent_mode = isset($input['consent_mode']) ? strtolower(trim((string) $input['consent_mode'])) : 'required';
        if (!in_array($consent_mode, array('required', 'granted'), true)) {
            $consent_mode = 'required';
        }

        $selectors = isset($input['lead_form_selectors'])
            ? sanitize_textarea_field((string) $input['lead_form_selectors'])
            : '';

        return array(
            'enabled' => empty($input['enabled']) ? '0' : '1',
            'api_base' => untrailingslashit($api_base),
            'consent_mode' => $consent_mode,
            'show_consent_ui' => empty($input['show_consent_ui']) ? '0' : '1',
            'brand' => isset($input['brand']) ? sanitize_text_field((string) $input['brand']) : $defaults['brand'],
            'privacy_policy_url' => isset($input['privacy_policy_url']) ? esc_url_raw((string) $input['privacy_policy_url']) : '',
            'cookie_policy_url' => isset($input['cookie_policy_url']) ? esc_url_raw((string) $input['cookie_policy_url']) : '',
            'lead_form_selectors' => $selectors,
            'debug' => empty($input['debug']) ? '0' : '1',
        );
    }

    private static function selector_list($raw) {
        $parts = preg_split('/[\r\n,]+/', (string) $raw);
        $result = array();

        foreach ($parts as $part) {
            $value = trim($part);
            if ($value === '' || strlen($value) > 200) {
                continue;
            }
            $result[] = $value;
            if (count($result) >= 25) {
                break;
            }
        }

        return array_values(array_unique($result));
    }

    public static function render_tracking_loader() {
        if (is_admin()) {
            return;
        }

        $settings = self::settings();
        if ($settings['enabled'] !== '1') {
            return;
        }

        $config = array(
            'apiBase' => $settings['api_base'],
            'consentMode' => $settings['consent_mode'],
            'formMode' => 'lead-only',
            'showConsentUi' => $settings['show_consent_ui'] === '1',
            'brand' => $settings['brand'],
            'privacyPolicyUrl' => $settings['privacy_policy_url'],
            'cookiePolicyUrl' => $settings['cookie_policy_url'],
            'leadFormSelectors' => self::selector_list($settings['lead_form_selectors']),
            'debug' => $settings['debug'] === '1',
            'adapter' => 'wordpress',
            'adapterVersion' => self::VERSION,
        );
        ?>
<script id="salsys-wordpress-bootstrap">
(function () {
  'use strict';
  if (window.__SalsysWordPressV1) return;
  window.__SalsysWordPressV1 = true;

  var cfg = <?php echo wp_json_encode($config, JSON_UNESCAPED_SLASHES); ?>;
  var base = String(cfg.apiBase || 'https://salsysos.com').replace(/\/$/, '');

  function hasScript(fragment) {
    return Array.prototype.some.call(document.scripts || [], function (script) {
      return String(script.src || '').indexOf(fragment) !== -1;
    });
  }

  function addScript(src, attrs) {
    if (hasScript(src)) return null;
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] === null || attrs[key] === undefined || attrs[key] === '') return;
      script.setAttribute(key, String(attrs[key]));
    });
    document.head.appendChild(script);
    return script;
  }

  function markLeadForms() {
    (cfg.leadFormSelectors || []).forEach(function (selector) {
      var nodes;
      try { nodes = document.querySelectorAll(selector); } catch (_) { return; }
      Array.prototype.forEach.call(nodes, function (node) {
        if (node && String(node.tagName || '').toLowerCase() === 'form') {
          node.setAttribute('data-salsys-lead-form', '');
        }
      });
    });
  }

  addScript(base + '/salsys-intelligence.js', {
    'data-api-base': base,
    'data-consent-mode': cfg.consentMode || 'required',
    'data-form-mode': cfg.formMode || 'lead-only',
    'data-debug': cfg.debug ? 'true' : 'false',
    'data-platform-adapter': 'wordpress',
    'data-platform-adapter-version': cfg.adapterVersion || '1.0.0'
  });

  if (cfg.showConsentUi) {
    addScript(base + '/salsys-consent.js', {
      'data-consent-banner': 'auto',
      'data-consent-settings': 'floating',
      'data-consent-brand': cfg.brand || 'Website',
      'data-privacy-policy-url': cfg.privacyPolicyUrl || '',
      'data-cookie-policy-url': cfg.cookiePolicyUrl || ''
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markLeadForms, { once: true });
  } else {
    markLeadForms();
  }

  if (cfg.leadFormSelectors && cfg.leadFormSelectors.length && window.MutationObserver) {
    var observer = new MutationObserver(function () { markLeadForms(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
</script>
        <?php
    }

    public static function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $settings = self::settings();
        $option = self::OPTION_KEY;
        ?>
<div class="wrap">
  <h1>Salsys Tracking</h1>
  <p>
    This adapter installs the canonical Salsys browser SDK. It does not create a second WordPress tracking database and it never needs a trusted Salsys server secret in the browser.
  </p>
  <p>
    Before enabling tracking, add this WordPress hostname as a <strong>Website</strong> tracking source in Salsys and set the current privacy notice version there.
  </p>

  <form method="post" action="options.php">
    <?php settings_fields('salsys_tracking_settings_group'); ?>
    <table class="form-table" role="presentation">
      <tr>
        <th scope="row">Enable Salsys</th>
        <td><label><input type="checkbox" name="<?php echo esc_attr($option); ?>[enabled]" value="1" <?php checked($settings['enabled'], '1'); ?>> Load Salsys on the public site</label></td>
      </tr>
      <tr>
        <th scope="row"><label for="salsys-api-base">Salsys base URL</label></th>
        <td><input id="salsys-api-base" class="regular-text" type="url" name="<?php echo esc_attr($option); ?>[api_base]" value="<?php echo esc_attr($settings['api_base']); ?>" required></td>
      </tr>
      <tr>
        <th scope="row"><label for="salsys-consent-mode">Analytics consent</label></th>
        <td>
          <select id="salsys-consent-mode" name="<?php echo esc_attr($option); ?>[consent_mode]">
            <option value="required" <?php selected($settings['consent_mode'], 'required'); ?>>Required (recommended)</option>
            <option value="granted" <?php selected($settings['consent_mode'], 'granted'); ?>>Granted by another consent authority</option>
          </select>
          <p class="description">Use “Granted” only when another consent system has already made the analytics decision before Salsys loads.</p>
        </td>
      </tr>
      <tr>
        <th scope="row">Salsys consent UI</th>
        <td><label><input type="checkbox" name="<?php echo esc_attr($option); ?>[show_consent_ui]" value="1" <?php checked($settings['show_consent_ui'], '1'); ?>> Show Salsys privacy banner/settings</label><p class="description">Disable this when an existing CMP is the single visual consent authority.</p></td>
      </tr>
      <tr>
        <th scope="row"><label for="salsys-brand">Brand</label></th>
        <td><input id="salsys-brand" class="regular-text" type="text" name="<?php echo esc_attr($option); ?>[brand]" value="<?php echo esc_attr($settings['brand']); ?>"></td>
      </tr>
      <tr>
        <th scope="row"><label for="salsys-privacy-url">Privacy policy URL</label></th>
        <td><input id="salsys-privacy-url" class="regular-text" type="url" name="<?php echo esc_attr($option); ?>[privacy_policy_url]" value="<?php echo esc_attr($settings['privacy_policy_url']); ?>"></td>
      </tr>
      <tr>
        <th scope="row"><label for="salsys-cookie-url">Cookie policy URL</label></th>
        <td><input id="salsys-cookie-url" class="regular-text" type="url" name="<?php echo esc_attr($option); ?>[cookie_policy_url]" value="<?php echo esc_attr($settings['cookie_policy_url']); ?>"></td>
      </tr>
      <tr>
        <th scope="row"><label for="salsys-lead-selectors">Lead-form selectors</label></th>
        <td>
          <textarea id="salsys-lead-selectors" class="large-text code" rows="6" name="<?php echo esc_attr($option); ?>[lead_form_selectors]"><?php echo esc_textarea($settings['lead_form_selectors']); ?></textarea>
          <p class="description">Optional CSS selectors, one per line or comma-separated. Only matching &lt;form&gt; elements are marked with data-salsys-lead-form. No form values are copied into tracking events.</p>
        </td>
      </tr>
      <tr>
        <th scope="row">Debug logging</th>
        <td><label><input type="checkbox" name="<?php echo esc_attr($option); ?>[debug]" value="1" <?php checked($settings['debug'], '1'); ?>> Enable browser debug logging</label></td>
      </tr>
    </table>
    <?php submit_button(); ?>
  </form>
</div>
        <?php
    }
}

Salsys_Tracking_Plugin::init();
