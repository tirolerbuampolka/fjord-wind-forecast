import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 via-accent/10 to-background">
      <section className="text-center px-6 py-20">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Track the wind from Drøbak to Lysaker</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Live wind, ETA prediction, and personalized gear advice for windsurfers. Be on the water when it turns on.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link to="/wind">Open Wind Tracker</Link>
          </Button>
        </div>
      </section>
    </main>
  );
};

export default Index;
