import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryPilotEnabled, discoveryHostAllowed } from '../../lib/knowledge-discovery/pilot-gate.ts';

test('discovery pilot defaults OFF, requires exact host opt-in, and emergency pause wins', () => {
  const vars=[
    'KNOWLEDGE_DISCOVERY_PILOT_ENABLED',
    'KNOWLEDGE_DISCOVERY_PAUSED',
    'KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS',
  ];
  const before=Object.fromEntries(vars.map(key=>[key,process.env[key]]));
  try {
    for(const key of vars)delete process.env[key];
    assert.equal(discoveryPilotEnabled(),false);
    assert.equal(discoveryHostAllowed('fixture.example.com'),false);

    process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED='true';
    assert.equal(discoveryPilotEnabled(),true);
    assert.equal(discoveryHostAllowed('fixture.example.com'),false,'empty allowlist fails closed');

    process.env.KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS='fixture.example.com, partner.example.net';
    assert.equal(discoveryHostAllowed('fixture.example.com'),true);
    assert.equal(discoveryHostAllowed('www.fixture.example.com'),true);
    assert.equal(discoveryHostAllowed('PARTNER.example.net'),true);
    assert.equal(discoveryHostAllowed('evil-fixture.example.com'),false);
    assert.equal(discoveryHostAllowed('fixture.example.com.attacker.org'),false);
    assert.equal(discoveryHostAllowed('private.fixture.example.com'),false);

    process.env.KNOWLEDGE_DISCOVERY_PAUSED='true';
    assert.equal(discoveryPilotEnabled(),false);
    assert.equal(discoveryHostAllowed('fixture.example.com'),false,
      'emergency pause overrides an active pilot');
    process.env.KNOWLEDGE_DISCOVERY_PAUSED='false';
    process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED='false';
    assert.equal(discoveryHostAllowed('fixture.example.com'),false);
  } finally {
    for(const key of vars){
      if(before[key]===undefined)delete process.env[key];
      else process.env[key]=before[key];
    }
  }
});
