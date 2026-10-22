import AppLayout from "../components/AppLayout";
import NearbyUnits from "../components/NearbyUnits";

const LiveMap = () => (
  <AppLayout title="Live Tracking">
    <NearbyUnits mapHeight={460} />
  </AppLayout>
);

export default LiveMap;
