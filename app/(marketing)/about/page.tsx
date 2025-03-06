import { Shield, Target, TrendingUp, Users, Award } from "lucide-react";
import Hero from "../components/Hero";
import AurumButton from "@/components/AurumButton";

export default function About() {
  return (
    <>
      <Hero
        title="About Aurum Capital"
        subtitle="Redefining the online betting experience with innovative, transparent, and rewarding prediction markets."
      />

      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-serif font-bold mb-6">Our Vision</h2>
              <p className="text-lg text-muted-foreground mb-6">
                Aurum Capital was founded with a clear vision: to create a
                betting platform that is fair, transparent, and rewarding for
                all participants.
              </p>
              <p className="text-lg text-muted-foreground mb-6">
                Our innovative approach combines the excitement of rapid trading
                with the simplicity of binary prediction, allowing users to
                leverage their market intuition without complicated trading
                interfaces.
              </p>
              <p className="text-lg text-muted-foreground">
                We're committed to building a community of traders who can enjoy
                frequent opportunities to profit from their predictions while
                maintaining responsible gaming practices.
              </p>
            </div>

            <div className="bg-card text-card-foreground p-8 rounded-xl">
              <h3 className="text-2xl font-serif font-bold mb-6 text-gold-500">
                Key Advantages
              </h3>

              <div className="space-y-6">
                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/20 flex items-center justify-center text-gold-500">
                      <Target size={24} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-medium mb-2">
                      Precision Trading
                    </h4>
                    <p className="text-gray-600 dark:text-gray-300">
                      Simple up/down predictions with clear outcomes within
                      short 10-second intervals.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/20 flex items-center justify-center text-gold-500">
                      <TrendingUp size={24} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-medium mb-2">High Returns</h4>
                    <p className="text-gray-600 dark:text-gray-300">
                      Potential to earn over 100% ROI on successful predictions
                      in just seconds.
                    </p>
                  </div>
                </div>

                <div className="flex">
                  <div className="flex-shrink-0 mr-4">
                    <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/20 flex items-center justify-center text-gold-500">
                      <Shield size={24} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-medium mb-2">Fair System</h4>
                    <p className="text-gray-600 dark:text-gray-300">
                      Transparent distribution of winnings with built-in
                      safeguards against market manipulation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-gradient-to-br from-blue-50/80 to-slate-100/80 dark:from-slate-900 dark:to-blue-950/90">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4 text-blue-800 dark:text-blue-300">
              Trading Mechanics
            </h2>
            <p className="text-lg text-blue-700 dark:text-blue-300 max-w-3xl mx-auto">
              Aurum's proprietary algorithm ensures transparent and efficient
              market operation
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
            <div className="bg-white/80 backdrop-blur-sm dark:bg-slate-800/60 border border-blue-100 dark:border-blue-900/50 p-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
              <div className="flex items-center mb-4 pb-2 border-b border-blue-100 dark:border-blue-800/30">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                  <Target
                    size={18}
                    className="text-blue-600 dark:text-blue-400"
                  />
                </div>
                <h3 className="text-xl font-medium text-blue-800 dark:text-blue-300">
                  Session Protocol
                </h3>
              </div>
              <ol className="space-y-4 list-decimal list-inside">
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    1.
                  </span>
                  <span>
                    10-second active trading window with real-time price
                    movement visualization
                  </span>
                </li>
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    2.
                  </span>
                  <span>
                    Binary position options: "Above" or "Below" the neutral
                    price axis
                  </span>
                </li>
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    3.
                  </span>
                  <span>
                    5-second settlement period with instant profit distribution
                  </span>
                </li>
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    4.
                  </span>
                  <span>
                    Standardized position sizing: $1 and $2 denominations only
                  </span>
                </li>
              </ol>
            </div>

            <div className="bg-white/80 backdrop-blur-sm dark:bg-slate-800/60 border border-blue-100 dark:border-blue-900/50 p-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
              <div className="flex items-center mb-4 pb-2 border-b border-blue-100 dark:border-blue-800/30">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                  <TrendingUp
                    size={18}
                    className="text-blue-600 dark:text-blue-400"
                  />
                </div>
                <h3 className="text-xl font-medium text-blue-800 dark:text-blue-300">
                  Profit Distribution
                </h3>
              </div>
              <ol className="space-y-4 list-decimal list-inside">
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    1.
                  </span>
                  <span>
                    Winners receive proportional share of the opposing pool
                  </span>
                </li>
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    2.
                  </span>
                  <span>
                    Platform maintains 8% operational fee on winning
                    distributions
                  </span>
                </li>
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    3.
                  </span>
                  <span>
                    Premium tier ($2) receives 65% allocation; Standard tier
                    ($1) receives 35%
                  </span>
                </li>
                <li className="text-blue-800 dark:text-blue-100 flex items-start">
                  <span className="font-semibold mr-2 text-blue-600 dark:text-blue-400 min-w-[20px] inline-block">
                    4.
                  </span>
                  <span>
                    Average ROI ranges from 90-120% per successful prediction
                  </span>
                </li>
              </ol>
            </div>
          </div>

          <div className="text-center">
            <AurumButton
              variant="primary"
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl"
            >
              Launch Trading Platform
            </AurumButton>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold mb-4 text-blue-800 dark:text-blue-300">
              Platform Metrics
            </h2>
            <p className="text-lg text-slate-700 dark:text-slate-300 max-w-3xl mx-auto">
              Aurum Capital delivers consistent performance metrics that
              demonstrate our platform's reliability and potential.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-lg text-center shadow-md">
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                5,760+
              </div>
              <div className="text-xl font-medium mb-1 text-slate-800 dark:text-slate-200">
                Daily Sessions
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Trading opportunities every day
              </div>
            </div>

            <div className="bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-lg text-center shadow-md">
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                90-120%
              </div>
              <div className="text-xl font-medium mb-1 text-slate-800 dark:text-slate-200">
                Average ROI
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                For successful predictions
              </div>
            </div>

            <div className="bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-lg text-center shadow-md">
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                15
              </div>
              <div className="text-xl font-medium mb-1 text-slate-800 dark:text-slate-200">
                Seconds
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Total cycle time per session
              </div>
            </div>

            <div className="bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-lg text-center shadow-md">
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                24/7
              </div>
              <div className="text-xl font-medium mb-1 text-slate-800 dark:text-slate-200">
                Platform Access
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Trade anytime, anywhere
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-white dark:bg-navy-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <h3 className="text-2xl font-serif font-bold mb-6 text-blue-800 dark:text-blue-300">
                Payment Options
              </h3>
              <p className="text-lg text-blue-700 dark:text-blue-200 mb-6">
                Aurum offers flexible and secure payment methods for deposits
                and withdrawals:
              </p>

              <div className="space-y-6 mb-8">
                <div className="bg-blue-50/80 backdrop-blur-sm dark:bg-slate-800/60 border border-blue-100 dark:border-blue-900/50 p-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
                  <h4 className="text-xl font-medium mb-2 text-blue-800 dark:text-blue-300">
                    ECO-USD
                  </h4>
                  <p className="text-blue-700 dark:text-blue-100">
                    Convert cash to ECO-USD via any ECO-USD agent, then transfer
                    to your Aurum account for instant deposits.
                  </p>
                </div>

                <div className="bg-blue-50/80 backdrop-blur-sm dark:bg-slate-800/60 border border-blue-100 dark:border-blue-900/50 p-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
                  <h4 className="text-xl font-medium mb-2 text-blue-800 dark:text-blue-300">
                    Direct Transfers
                  </h4>
                  <p className="text-blue-700 dark:text-blue-100">
                    Send money directly between Aurum accounts, allowing users
                    to exchange cash for aUSD without any platform intervention.
                  </p>
                </div>
              </div>

              <AurumButton
                variant="primary"
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md hover:shadow-lg transition-all duration-300"
              >
                Open Account Now
              </AurumButton>
            </div>

            <div className="order-1 lg:order-2 flex justify-center">
              <div className="bg-blue-50/80 backdrop-blur-sm dark:bg-slate-800/60 border border-blue-100 dark:border-blue-900/50 p-8 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 max-w-md w-full">
                <h3 className="text-2xl font-serif font-bold mb-6 text-blue-800 dark:text-blue-300 text-center">
                  Why Choose Aurum
                </h3>

                <div className="space-y-6">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-4 text-blue-600 dark:text-blue-400">
                      <Award size={18} />
                    </div>
                    <div className="text-lg text-blue-700 dark:text-blue-100">
                      Simple, intuitive trading interface
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-4 text-blue-600 dark:text-blue-400">
                      <Award size={18} />
                    </div>
                    <div className="text-lg text-blue-700 dark:text-blue-100">
                      Transparent fee structure (8% on winning pools)
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-4 text-blue-600 dark:text-blue-400">
                      <Award size={18} />
                    </div>
                    <div className="text-lg text-blue-700 dark:text-blue-100">
                      High potential returns on every session
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-4 text-blue-600 dark:text-blue-400">
                      <Award size={18} />
                    </div>
                    <div className="text-lg text-blue-700 dark:text-blue-100">
                      Fixed bet sizes for optimal risk management
                    </div>
                  </div>

                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-4 text-blue-600 dark:text-blue-400">
                      <Award size={18} />
                    </div>
                    <div className="text-lg text-blue-700 dark:text-blue-100">
                      Secure payment methods and fast withdrawals
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-6 bg-gradient-to-br from-blue-50/80 to-slate-100/80 dark:from-slate-900 dark:to-blue-950/90">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-serif font-bold mb-4 text-blue-800 dark:text-blue-300">
            Join the Aurum Community
          </h2>
          <p className="text-lg text-blue-700 dark:text-blue-200 mb-8 max-w-2xl mx-auto">
            Start trading now and experience the next generation of online
            betting with Aurum Capital.
          </p>

          <AurumButton
            variant="primary"
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-300"
          >
            Create Your Account
          </AurumButton>
        </div>
      </section>
    </>
  );
}
