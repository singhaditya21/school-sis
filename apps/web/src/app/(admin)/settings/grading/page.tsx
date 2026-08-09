import { getGradingSchemes } from '@/lib/actions/grading';
import GradingSettingsClient from './grading-settings-client';

export default async function GradingSettingsPage() {
    const schemes = await getGradingSchemes();
    return <GradingSettingsClient initialSchemes={schemes} />;
}
