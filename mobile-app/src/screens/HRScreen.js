import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Alert,
} from "react-native";
import {
    CalendarCheck,
    Clock,
    CalendarDays,
    User,
    LayoutGrid,
    MapPin,
    Receipt,
    Network,
    CheckSquare,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../api/axios";
import HRModuleFooter from "../components/HRModuleFooter";

const HRScreen = ({ navigation }) => {
    const [hasSubordinates, setHasSubordinates] = useState(false);

    useEffect(() => {
        const checkReportingStatus = async () => {
            try {
                const userStr = await AsyncStorage.getItem('user');
                if (userStr) {
                    const u = JSON.parse(userStr);
                    const userRole = (u.role || '').toLowerCase();
                    if (userRole === 'admin' || userRole === 'superadmin' || userRole === 'hr') {
                        setHasSubordinates(true);
                        return;
                    }
                }
                const res = await api.get('/leaves/approvals');
                if (res.data && res.data.hasSubordinates !== undefined) {
                    setHasSubordinates(res.data.hasSubordinates);
                } else {
                    setHasSubordinates(false);
                }
            } catch (_) {
                setHasSubordinates(false);
            }
        };
        checkReportingStatus();
    }, []);

    const hrItems = [
        {
            key: "attendance",
            label: "Attendance",
            icon: CalendarCheck,
            iconColor: "#1972e9",
            bg: "#ebf3fe",
            onPress: () => navigation.navigate("Attendance"),
        },
        {
            key: "shift",
            label: "Shift",
            icon: Clock,
            iconColor: "#f59e0b",
            bg: "#fff7e6",
            onPress: () => navigation.navigate("Shift"),
        },
        {
            key: "leaves",
            label: "Leaves",
            icon: CalendarDays,
            iconColor: "#ef4444",
            bg: "#fdeeee",
            onPress: () => navigation.navigate("Leave"),
        },
        ...(hasSubordinates ? [{
            key: "leaveApprovals",
            label: "Leave Approvals",
            icon: CheckSquare,
            iconColor: "#059669",
            bg: "#ecfdf5",
            onPress: () => navigation.navigate("LeaveApprovals"),
        }] : []),
        {
            key: "orgChart",
            label: "Org. Chart",
            icon: Network,
            iconColor: "#4f46e5",
            bg: "#eef2ff",
            onPress: () => navigation.navigate("OrgChartScreen"),
        },
        {
            key: "profile",
            label: "Profile",
            icon: User,
            iconColor: "#8b5cf6",
            bg: "#f2edfe",
            onPress: () => navigation.navigate("Profile"),
        },
        {
            key: "monthlyView",
            label: "Monthly View",
            icon: LayoutGrid,
            iconColor: "#10b981",
            bg: "#e6f7f0",
            onPress: () => navigation.navigate("MonthlyViewScreen"),
        },
        {
            key: "customerVisit",
            label: "Customer Visit",
            icon: MapPin,
            iconColor: "#e91e63",
            bg: "#fdf0f5",
            onPress: () => navigation.navigate("CustomerVisitScreen"),
        },
        {
            key: "expenseClaim",
            label: "Expense Claim",
            icon: Receipt,
            iconColor: "#ff9800",
            bg: "#fff3eb",
            comingSoon: true,
            onPress: () =>
                Alert.alert("Coming Soon", "Expense Claim will be available soon."),
        },
    ];

    return (
        <View className="flex-1 bg-[#f6f8fc]">
            <StatusBar barStyle="light-content" backgroundColor="#1972e9" />

            {/* Header */}
            <View className="bg-[#1972e9] pt-14 pb-6 px-6 rounded-b-[40px] shadow-sm flex-row items-center">
                {/* SIDEBAR BUTTON COMMENTED OUT
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={openSidebar}
                    className="w-10 h-10 rounded-full bg-white/15 justify-center items-center mr-3"
                >
                    <Menu size={22} color="white" />
                </TouchableOpacity>
                */}
                <View>
                    <Text className="text-white text-[20px] font-bold tracking-wide">
                        HR
                    </Text>
                    <Text className="text-white/70 text-[12px] font-semibold mt-0.5">
                        Everything HR, in one place
                    </Text>
                </View>
            </View>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="flex-row flex-wrap justify-between">
                    {hrItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <TouchableOpacity
                                key={item.key}
                                activeOpacity={0.9}
                                onPress={item.onPress}
                                className="bg-white rounded-[28px] p-6 w-[47%] items-center justify-center mb-4 shadow-lg shadow-slate-100/50"
                            >
                                <View
                                    className="w-14 h-14 rounded-full justify-center items-center mb-4"
                                    style={{ backgroundColor: item.bg }}
                                >
                                    <Icon size={24} color={item.iconColor} />
                                </View>
                                <Text className="text-slate-800 font-bold text-[14px] text-center tracking-wide">
                                    {item.label}
                                </Text>
                                {item.comingSoon && (
                                    <Text className="text-[#f59e0b] font-bold text-[10px] text-center tracking-wide mt-1">
                                        Coming soon
                                    </Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* HR Module Footer */}
            <HRModuleFooter navigation={navigation} currentScreen="hrScreen" />
        </View>
    );
};

export default HRScreen;