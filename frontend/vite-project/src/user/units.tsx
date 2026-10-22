import AppLayout from "../components/AppLayout";
import NearbyUnits from "../components/NearbyUnits";

const ServiceUnits = () => (
  <AppLayout title="Service Units">
    <h2>Service units near you</h2>
    <p className="sub">Verified ambulances that are on duty and sharing a recent position. Dispatch decides which unit is sent.</p>
    <NearbyUnits mapHeight={340} />
  </AppLayout>
);

export default ServiceUnits;
