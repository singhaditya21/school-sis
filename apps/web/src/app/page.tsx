import { redirect } from 'next/navigation';

export default function RootInterface() {
    // Since marketing is structurally segregated, any raw traffic to the product domain forces authentication
    redirect('/login');
}
