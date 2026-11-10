import { ruleKey, writingPreferences } from './writing-preferences.js';
const commonTransition = /^(?:fade\s+in|fade\s+out|fade\s+to\s+black|fade\s+to\s+white|cut\s+to|dissolve\s+to|smash\s+cut\s+to|match\s+cut\s+to|jump\s+cut\s+to|hard\s+cut\s+to|wipe\s+to|iris\s+(?:in|out))\s*[:.]?$/i;
export const isBuiltInTransition = text => commonTransition.test(text.trim());
export const isTrainedTransition = text => !/[\r\n]/u.test(text) && writingPreferences().transitions.includes(ruleKey(text));
export const isCommonTransition = text => isBuiltInTransition(text) || isTrainedTransition(text);
export const transitionClass = el => el.type === 'transition' && /^fade\s+in\s*[:.]?$/i.test(el.text.trim()) ? 'transition-left' : '';
