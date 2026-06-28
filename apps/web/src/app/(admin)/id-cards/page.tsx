import { getIDCards, getCertificateStats, getCertificateTemplates } from '@/lib/actions/certificate';
import IdCardsClient from './IdCardsClient';

export default async function IDCardsPage() {
    const stats = await getCertificateStats();
    const templates = await getCertificateTemplates();
    const studentCards = await getIDCards('STUDENT');
    const staffCards = await getIDCards('STAFF');

    return <IdCardsClient stats={stats} templates={templates} studentCards={studentCards} staffCards={staffCards} />;
}
