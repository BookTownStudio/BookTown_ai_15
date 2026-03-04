import React from 'react';
import AdminLayout from '../layout.tsx';
import IntelligenceAggregateDashboard from '../../../components/admin/IntelligenceAggregateDashboard.tsx';

const AdminIntelligencePage: React.FC = () => {
  return (
    <AdminLayout titleEn="Intelligence Aggregates" titleAr="تجميعات الذكاء">
      <IntelligenceAggregateDashboard />
    </AdminLayout>
  );
};

export default AdminIntelligencePage;

