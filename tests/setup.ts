import { beforeEach } from 'vitest';
import { setLanguage } from '../src/i18n';

// The game itself detects the language; unit tests run with the German UI by
// default (tests for other languages switch explicitly).
beforeEach(() => setLanguage('de'));
