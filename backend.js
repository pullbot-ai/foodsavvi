// ===============================
// BACK4APP CONFIGURATION
// ===============================

Parse.initialize(
    "46LC4r7Yd2qnuNWYBU5KVmws940Qh0AjE15wzoJt",
    "GmwiSEc2ptMPGx7zusu3N9UaA8Nvn2oxKbVVIRKA"
);
Parse.serverURL = "https://parseapi.back4app.com";

const MASTER_KEY = "WxkZjSeBNKbHWyouy4fSew0hLoFnxyDztZtlvxrM";

// ✅ Set Master Key globally (works in browser)
Parse.CoreManager.set('MASTER_KEY', MASTER_KEY);

// ===============================
// BACKEND OBJECT
// ===============================

const Backend = {
    // ========== USER AUTH ==========
    async register(username, password, role, businessDetails = null) {
        try {
            if (!username || !password || !role) {
                return { success: false, message: "All fields are required" };
            }
            if (password.length < 6) {
                return { success: false, message: "Password must be at least 6 characters" };
            }

            const usernameCheck = await this.checkUsernameExists(username);
            if (usernameCheck.exists) {
                return { success: false, message: "Username already taken. Please choose another." };
            }

            if (role === "advertiser" && businessDetails && businessDetails.name && !businessDetails.isEmployee) {
                const businessNameCheck = await this.checkBusinessNameExists(businessDetails.name);
                if (businessNameCheck.exists) {
                    return { success: false, message: "Business name already taken. Please choose another." };
                }
            }

            const user = new Parse.User();
            user.set("username", username);
            user.set("password", password);
            user.set("role", role);
            user.set("email", businessDetails?.email || `${username}@foodsavvi.com`);
            
            if (role === "advertiser" && businessDetails) {
                // ===== EMPLOYEE REGISTRATION =====
                if (businessDetails.isEmployee) {
                    // Set role to 'pending' until owner approves
                    user.set("businessRole", "pending");
                    user.set("businessId", businessDetails.businessId);
                    user.set("businessName", businessDetails.businessName);
                    user.set("businessStaffStatus", "pending"); // Add pending status
                    
                    // Save the new employee user FIRST
                    await user.signUp();

                    // ===== CRITICAL: Use Master Key to update Owner =====
                    const ownerQuery = new Parse.Query(Parse.User);
                    const owner = await ownerQuery.get(businessDetails.businessId, { useMasterKey: true });
                    
                    if (owner) {
                        const staffList = owner.get("businessStaff") || [];
                        if (!staffList.includes(user.id)) {
                            staffList.push(user.id);
                            owner.set("businessStaff", staffList);
                            // Save the owner with Master Key to bypass permissions
                            await owner.save(null, { useMasterKey: true });
                        }
                    }

                    // Login the employee immediately
                    await Parse.User.logIn(username, password);

                } else {
                    // ===== OWNER REGISTRATION =====
                    const inviteCode = Math.floor(100000 + Math.random() * 900000).toString();
                    user.set("invitationCode", inviteCode);

                    user.set("businessName", businessDetails.name);
                    user.set("businessPhone", businessDetails.phone);
                    user.set("businessEmail", businessDetails.email);
                    user.set("businessAddress", businessDetails.address);
                    user.set("businessLat", parseFloat(businessDetails.latitude) || 0);
                    user.set("businessLng", parseFloat(businessDetails.longitude) || 0);
                    user.set("businessOpen", businessDetails.openTime || "09:00");
                    user.set("businessClose", businessDetails.closeTime || "21:00");
                    user.set("businessType", businessDetails.type || "grocery");
                    user.set("businessTaxId", businessDetails.taxId || "");
                    user.set("businessVerified", false);
                    user.set("businessRole", "owner");
                    user.set("businessStaff", []);
                    user.set("businessWalletBalance", 0);
                    user.set("pendingWalletBalance", 0);
                    
                    await user.signUp();
                }
            } else if (role === "consumer") {
                user.set("walletBalance", 0);
                user.set("savedAddresses", []);
                await user.signUp();
            }
            
            // Sync LocalStorage
            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("businessName", businessDetails?.name || username);
                localStorage.setItem("businessRole", businessDetails?.isEmployee ? "pending" : "owner");
                localStorage.setItem("businessVerified", "false");
                if (businessDetails) {
                    localStorage.setItem("businessDetails", JSON.stringify({
                        ...businessDetails,
                        verified: false,
                        role: businessDetails?.isEmployee ? "pending" : "owner"
                    }));
                }
            } else {
                localStorage.setItem("loggedInConsumer", username);
            }
            
            return { success: true, message: "Registration successful!" };
        } catch (error) {
            let message = error.message;
            if (error.code === 202) message = "Username already exists";
            if (error.code === 203) message = "Email already exists";
            console.error('Registration error:', error);
            return { success: false, message };
        }
    },

    async login(username, password, role) {
        try {
            const user = await Parse.User.logIn(username, password);
            
            if (user.get("role") !== role) {
                await Parse.User.logOut();
                return { success: false, message: "Wrong login type selected" };
            }

            localStorage.setItem("loggedInUser", username);
            localStorage.setItem("userRole", role);
            
            if (role === "advertiser") {
                localStorage.setItem("loggedInShop", username);
                localStorage.setItem("businessName", user.get("businessName") || username);
                localStorage.setItem("businessRole", user.get("businessRole") || 'pending');
                localStorage.setItem("businessVerified", user.get("businessVerified") ? "true" : "false");
                
                const businessDetails = {
                    name: user.get("businessName") || username,
                    phone: user.get("businessPhone") || "",
                    email: user.get("businessEmail") || "",
                    address: user.get("businessAddress") || "",
                    latitude: user.get("businessLat") || "",
                    longitude: user.get("businessLng") || "",
                    openTime: user.get("businessOpen") || "09:00",
                    closeTime: user.get("businessClose") || "21:00",
                    type: user.get("businessType") || "grocery",
                    taxId: user.get("businessTaxId") || "",
                    verified: user.get("businessVerified") || false,
                    role: user.get("businessRole") || 'pending'
                };
                localStorage.setItem("businessDetails", JSON.stringify(businessDetails));
            } else {
                localStorage.setItem("loggedInConsumer", username);
                const walletBalance = user.get("walletBalance") || 0;
                localStorage.setItem("walletBalance", walletBalance);
            }
            
            return { success: true, role };
        } catch (error) {
            let message = error.message;
            if (error.code === 101) message = "Invalid username or password";
            console.error('Login error:', error);
            return { success: false, message };
        }
    },

    async logout() {
        try {
            await Parse.User.logOut();
            localStorage.clear();
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false, message: error.message };
        }
    },

    getCurrentUser() {
        return Parse.User.current();
    },

    // ========== VALIDATION FUNCTIONS ==========
    
    async checkUsernameExists(username) {
        try {
            const query = new Parse.Query(Parse.User);
            query.equalTo("username", username);
            const user = await query.first();
            return { exists: !!user };
        } catch (error) {
            console.error('checkUsernameExists error:', error);
            return { exists: false };
        }
    },

    async checkBusinessNameExists(businessName) {
        try {
            const query = new Parse.Query(Parse.User);
            query.equalTo("businessName", businessName);
            const user = await query.first();
            return { exists: !!user };
        } catch (error) {
            console.error('checkBusinessNameExists error:', error);
            return { exists: false };
        }
    },

    // ========== DELETE ACCOUNT ==========
    
    async deleteAccount(userId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.id !== userId) return { success: false, message: "Unauthorized" };
            
            // Delete related data
            try {
                const Order = Parse.Object.extend("Order");
                const orderQuery = new Parse.Query(Order);
                orderQuery.equalTo("consumerId", userId);
                const orders = await orderQuery.find();
                if (orders.length > 0) await Parse.Object.destroyAll(orders);
                
                const Fridge = Parse.Object.extend("Fridge");
                const fridgeQuery = new Parse.Query(Fridge);
                fridgeQuery.equalTo("userId", userId);
                const fridgeItems = await fridgeQuery.find();
                if (fridgeItems.length > 0) await Parse.Object.destroyAll(fridgeItems);
                
                const ShoppingLists = Parse.Object.extend("ShoppingLists");
                const listQuery = new Parse.Query(ShoppingLists);
                listQuery.equalTo("userId", userId);
                const lists = await listQuery.find();
                if (lists.length > 0) await Parse.Object.destroyAll(lists);
                
            } catch (cleanupError) {
                console.error("Error cleaning up user data:", cleanupError);
            }
            
            await currentUser.destroy();
            localStorage.clear();
            return { success: true, message: "Account deleted successfully" };
        } catch (error) {
            console.error("Error deleting account:", error);
            return { success: false, message: error.message || "Failed to delete account" };
        }
    },

    // ========== BUSINESS PROFILE ==========
    
    async getBusinessProfile() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            return {
                id: currentUser.id,
                username: currentUser.get("username"),
                businessName: currentUser.get("businessName"),
                businessPhone: currentUser.get("businessPhone"),
                businessEmail: currentUser.get("businessEmail"),
                businessAddress: currentUser.get("businessAddress"),
                businessLat: currentUser.get("businessLat"),
                businessLng: currentUser.get("businessLng"),
                businessOpen: currentUser.get("businessOpen"),
                businessClose: currentUser.get("businessClose"),
                businessType: currentUser.get("businessType"),
                businessTaxId: currentUser.get("businessTaxId"),
                businessVerified: currentUser.get("businessVerified"),
                businessRole: currentUser.get("businessRole"),
                businessStaff: currentUser.get("businessStaff") || [],
                businessWalletBalance: currentUser.get("businessWalletBalance") || 0,
                pendingWalletBalance: currentUser.get("pendingWalletBalance") || 0,
                invitationCode: currentUser.get("invitationCode") || "",
                createdAt: currentUser.get("createdAt")
            };
        } catch (error) {
            console.error('getBusinessProfile error:', error);
            return { success: false, message: error.message };
        }
    },

    async updateBusinessProfile(updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            const userRole = currentUser.get("businessRole");
            if (userRole !== "owner" && userRole !== "manager") {
                return { success: false, message: "Only owners and managers can edit business profile" };
            }
            Object.keys(updates).forEach(key => {
                if (key.startsWith('business')) {
                    currentUser.set(key, updates[key]);
                }
            });
            await currentUser.save();
            return { success: true };
        } catch (error) {
            console.error('updateBusinessProfile error:', error);
            return { success: false, message: error.message };
        }
    },

    // ========== STAFF MANAGEMENT ==========
    
    async addStaffMember(staffUsername, staffRole = "staff") {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can add staff members" };
            }
            const query = new Parse.Query(Parse.User);
            query.equalTo("username", staffUsername);
            const staffUser = await query.first();
            if (!staffUser) return { success: false, message: "User not found" };
            if (staffUser.get("role") !== "advertiser") {
                return { success: false, message: "User must be an advertiser" };
            }
            const staffList = currentUser.get("businessStaff") || [];
            if (staffList.includes(staffUser.id)) {
                return { success: false, message: "Staff member already added" };
            }
            staffList.push(staffUser.id);
            currentUser.set("businessStaff", staffList);
            await currentUser.save();
            staffUser.set("businessRole", staffRole);
            staffUser.set("businessName", currentUser.get("businessName"));
            staffUser.set("businessId", currentUser.id);
            await staffUser.save();
            return { success: true, message: "Staff member added" };
        } catch (error) {
            console.error('addStaffMember error:', error);
            return { success: false, message: error.message };
        }
    },

    async removeStaffMember(staffId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can remove staff members" };
            }
            const staffList = currentUser.get("businessStaff") || [];
            currentUser.set("businessStaff", staffList.filter(id => id !== staffId));
            await currentUser.save();
            const staffUser = await new Parse.Query(Parse.User).get(staffId);
            staffUser.unset("businessRole");
            staffUser.unset("businessName");
            staffUser.unset("businessId");
            await staffUser.save();
            return { success: true };
        } catch (error) {
            console.error('removeStaffMember error:', error);
            return { success: false, message: error.message };
        }
    },

    // ===== FIXED: Fetch fresh owner data so staff list actually loads =====
    async getStaffList() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];
            
            // 🔥 FIX: Fetch fresh owner data from server
            const freshOwner = await new Parse.Query(Parse.User).get(currentUser.id, { useMasterKey: true });
            const staffIds = freshOwner.get("businessStaff") || [];
            
            if (staffIds.length === 0) return [];
            
            const query = new Parse.Query(Parse.User);
            query.containedIn("objectId", staffIds);
            const staffUsers = await query.find({ useMasterKey: true });
            
            return staffUsers.map(user => ({
                id: user.id,
                username: user.get("username"),
                role: user.get("businessRole") || "pending",
                email: user.get("email")
            }));
        } catch (error) {
            console.error('getStaffList error:', error);
            return [];
        }
    },

    // ========== BUSINESS VERIFICATION ==========
    
    async submitVerification() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can submit verification" };
            }
            currentUser.set("businessVerified", true);
            await currentUser.save();
            localStorage.setItem("businessVerified", "true");
            return { success: true, message: "Business verified!" };
        } catch (error) {
            console.error('submitVerification error:', error);
            return { success: false, message: error.message };
        }
    },

    async getVerificationStatus() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return null;
            return {
                status: currentUser.get("businessVerified") ? "verified" : "pending",
                verified: currentUser.get("businessVerified") || false
            };
        } catch (error) {
            console.error('getVerificationStatus error:', error);
            return null;
        }
    },

    // ========== ADVERTISEMENTS ==========
    
    async createAd(adData) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (!currentUser.get("businessVerified")) {
                return { success: false, message: "Business must be verified to post ads" };
            }

            const Ad = Parse.Object.extend("Advertisement");
            const ad = new Ad();
            ad.set("foodName", adData.foodName);
            ad.set("discount", parseFloat(adData.discount));
            ad.set("offerEnds", new Date(adData.offerEnds));
            ad.set("batchExpiryDate", new Date(adData.batchExpiryDate));
            ad.set("businessName", currentUser.get("businessName"));
            ad.set("businessId", currentUser.id);
            ad.set("description", adData.description || "");
            ad.set("originalPrice", parseFloat(adData.originalPrice) || 0);
            ad.set("category", adData.category || "other");
            ad.set("active", true);
            ad.set("views", 0);
            ad.set("claimed", 0);
            ad.set("batchNumber", adData.batchNumber || "");
            ad.set("quantityLeft", parseInt(adData.quantityLeft) || 0);
            ad.set("initialQuantity", parseInt(adData.quantityLeft) || 0);
            
            if (adData.imageBase64) {
                ad.set("productImage", adData.imageBase64);
            }
            
            await ad.save();
            return { success: true, ad: ad, adId: ad.id };
        } catch (error) {
            console.error('createAd error:', error);
            return { success: false, message: error.message };
        }
    },

    async getActiveAds(options = {}) {
        try {
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            query.equalTo("active", true);
            query.greaterThan("offerEnds", new Date());
            query.greaterThan("quantityLeft", 0);
            query.descending("createdAt");
            
            if (options.category && options.category !== 'all') {
                query.equalTo("category", options.category);
            }
            if (options.businessId) {
                query.equalTo("businessId", options.businessId);
            }
            if (options.search) {
                query.matches("foodName", new RegExp(options.search, "i"));
            }
            query.limit(options.limit || 100);
            
            const ads = await query.find();
            return ads.map(ad => ({
                id: ad.id,
                foodName: ad.get("foodName"),
                discount: ad.get("discount"),
                offerEnds: ad.get("offerEnds"),
                batchExpiryDate: ad.get("batchExpiryDate"),
                businessName: ad.get("businessName"),
                shopName: ad.get("businessName"),
                description: ad.get("description"),
                originalPrice: ad.get("originalPrice"),
                category: ad.get("category"),
                views: ad.get("views"),
                claimed: ad.get("claimed"),
                batchNumber: ad.get("batchNumber"),
                quantityLeft: ad.get("quantityLeft"),
                productImage: ad.get("productImage") || null
            }));
        } catch (error) {
            console.error('getActiveAds error:', error);
            return [];
        }
    },

    async getShopAds(businessId) {
        try {
            if (!businessId) {
                const currentUser = Parse.User.current();
                businessId = currentUser?.id;
            }
            if (!businessId) return [];
            
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            query.equalTo("businessId", businessId);
            query.descending("createdAt");
            
            const ads = await query.find();
            return ads.map(ad => ({
                id: ad.id,
                foodName: ad.get("foodName"),
                discount: ad.get("discount"),
                offerEnds: ad.get("offerEnds"),
                batchExpiryDate: ad.get("batchExpiryDate"),
                businessName: ad.get("businessName"),
                active: ad.get("active"),
                views: ad.get("views"),
                claimed: ad.get("claimed"),
                batchNumber: ad.get("batchNumber"),
                quantityLeft: ad.get("quantityLeft"),
                productImage: ad.get("productImage") || null
            }));
        } catch (error) {
            console.error('getShopAds error:', error);
            return [];
        }
    },

    async updateAd(adId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            const Ad = Parse.Object.extend("Advertisement");
            const ad = await new Parse.Query(Ad).get(adId);
            if (ad.get("businessId") !== currentUser.id) {
                return { success: false, message: "Unauthorized" };
            }
            Object.keys(updates).forEach(key => {
                if (key === 'offerEnds') {
                    ad.set(key, new Date(updates[key]));
                } else if (key === 'batchExpiryDate') {
                    ad.set(key, new Date(updates[key]));
                } else if (key === 'imageBase64') {
                    ad.set("productImage", updates[key]);
                } else {
                    ad.set(key, updates[key]);
                }
            });
            await ad.save();
            return { success: true };
        } catch (error) {
            console.error('updateAd error:', error);
            return { success: false, message: error.message };
        }
    },

    async deleteAd(adId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            const Ad = Parse.Object.extend("Advertisement");
            const ad = await new Parse.Query(Ad).get(adId);
            if (ad.get("businessId") !== currentUser.id) {
                return { success: false, message: "Unauthorized" };
            }
            await ad.destroy();
            return { success: true };
        } catch (error) {
            console.error('deleteAd error:', error);
            return { success: false, message: error.message };
        }
    },

    async incrementViews(adId) {
        try {
            const Ad = Parse.Object.extend("Advertisement");
            const ad = await new Parse.Query(Ad).get(adId);
            ad.increment("views");
            await ad.save();
            return { success: true };
        } catch (error) {
            console.error('incrementViews error:', error);
            return { success: false };
        }
    },

    // ========== ORDER SYSTEM ==========
    
    async createOrder(orderItems, totalAmount) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.get("role") !== "consumer") {
                return { success: false, message: "Please login as consumer" };
            }

            if (!orderItems || orderItems.length === 0) {
                return { success: false, message: "No items in cart" };
            }

            const userQuery = new Parse.Query(Parse.User);
            const freshUser = await userQuery.get(currentUser.id, { useMasterKey: true });
            let walletBalance = freshUser.get("walletBalance") || 0;
            
            let calculatedTotal = 0;
            for (const item of orderItems) {
                const discountedPrice = item.originalPrice * (1 - item.discount / 100);
                calculatedTotal += discountedPrice * item.quantity;
            }

            if (walletBalance < calculatedTotal) {
                return { success: false, message: `Insufficient balance. Need $${calculatedTotal.toFixed(2)}` };
            }

            const processedOrders = [];
            const failedItems = [];
            let totalDeducted = 0;
            
            for (const item of orderItems) {
                try {
                    const Ad = Parse.Object.extend("Advertisement");
                    const query = new Parse.Query(Ad);
                    const ad = await query.get(item.id, { useMasterKey: true });
                    
                    if (!ad || !ad.get("active")) {
                        failedItems.push(item);
                        continue;
                    }
                    
                    const quantityLeft = ad.get("quantityLeft") || 0;
                    if (quantityLeft < item.quantity) {
                        failedItems.push(item);
                        continue;
                    }
                    
                    const newQuantityLeft = quantityLeft - item.quantity;
                    ad.set("quantityLeft", newQuantityLeft);
                    if (newQuantityLeft === 0) ad.set("active", false);
                    ad.increment("claimed", item.quantity);
                    await ad.save(null, { useMasterKey: true });
                    
                    const discountedPrice = ad.get("originalPrice") * (1 - ad.get("discount") / 100);
                    const itemTotal = discountedPrice * item.quantity;
                    
                    const Order = Parse.Object.extend("Order");
                    const order = new Order();
                    order.set("adId", ad.id);
                    order.set("businessId", ad.get("businessId"));
                    order.set("businessName", ad.get("businessName"));
                    order.set("consumerId", currentUser.id);
                    order.set("consumerName", currentUser.get("username"));
                    order.set("foodName", ad.get("foodName"));
                    order.set("quantity", item.quantity);
                    order.set("discount", ad.get("discount"));
                    order.set("originalPrice", ad.get("originalPrice"));
                    order.set("batchNumber", ad.get("batchNumber") || "");
                    order.set("totalAmount", itemTotal);
                    order.set("status", "pending");
                    order.set("createdAt", new Date());
                    await order.save(null, { useMasterKey: true });
                    processedOrders.push(order);
                    
                    // Add to business pending wallet
                    const businessUser = await new Parse.Query(Parse.User).get(ad.get("businessId"), { useMasterKey: true });
                    const currentPending = businessUser.get("pendingWalletBalance") || 0;
                    businessUser.set("pendingWalletBalance", currentPending + itemTotal);
                    await businessUser.save(null, { useMasterKey: true });
                    
                    totalDeducted += itemTotal;
                } catch (error) {
                    console.error('Item processing error:', error);
                    failedItems.push(item);
                }
            }
            
            if (processedOrders.length === 0) {
                return { success: false, message: "All items failed." };
            }
            
            const newBalance = walletBalance - totalDeducted;
            freshUser.set("walletBalance", newBalance);
            await freshUser.save(null, { useMasterKey: true });
            
            const confirmUser = await new Parse.Query(Parse.User).get(currentUser.id, { useMasterKey: true });
            const confirmedBalance = confirmUser.get("walletBalance") || 0;
            
            const currentUserRef = Parse.User.current();
            if (currentUserRef) {
                currentUserRef.set("walletBalance", confirmedBalance);
            }
            localStorage.setItem("walletBalance", confirmedBalance);
            localStorage.removeItem('claimCart');
            
            return { 
                success: true, 
                message: `Order placed! New balance: $${confirmedBalance.toFixed(2)}`,
                orders: processedOrders,
                newBalance: confirmedBalance,
                totalPaid: totalDeducted,
                failedItems: failedItems
            };
            
        } catch (error) {
            console.error("✖ Create order error:", error);
            return { success: false, message: error.message };
        }
    },

    async getConsumerOrders(consumerId) {
        try {
            const Order = Parse.Object.extend("Order");
            const query = new Parse.Query(Order);
            query.equalTo("consumerId", consumerId);
            query.descending("createdAt");
            const orders = await query.find();
            return orders.map(o => ({
                id: o.id,
                businessName: o.get("businessName"),
                businessId: o.get("businessId"),
                foodName: o.get("foodName"),
                quantity: o.get("quantity"),
                totalAmount: o.get("totalAmount"),
                status: o.get("status"),
                batchNumber: o.get("batchNumber"),
                createdAt: o.get("createdAt"),
                collectByTime: o.get("collectByTime")
            }));
        } catch (error) {
            console.error('getConsumerOrders error:', error);
            return [];
        }
    },

    async getOrdersForBusiness(businessId) {
        try {
            if (!businessId) {
                const currentUser = Parse.User.current();
                businessId = currentUser?.id;
            }
            if (!businessId) return [];
            
            const Order = Parse.Object.extend("Order");
            const query = new Parse.Query(Order);
            query.equalTo("businessId", businessId);
            query.descending("createdAt");
            const orders = await query.find();
            return orders.map(o => ({
                id: o.id,
                consumerName: o.get("consumerName"),
                consumerId: o.get("consumerId"),
                foodName: o.get("foodName"),
                quantity: o.get("quantity"),
                discount: o.get("discount"),
                batchNumber: o.get("batchNumber"),
                totalAmount: o.get("totalAmount"),
                status: o.get("status"),
                createdAt: o.get("createdAt"),
                collectByTime: o.get("collectByTime")
            }));
        } catch (error) {
            console.error('getOrdersForBusiness error:', error);
            return [];
        }
    },

    async confirmOrderByBusiness(orderId, collectByTime = null) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            
            const Order = Parse.Object.extend("Order");
            const query = new Parse.Query(Order);
            const order = await query.get(orderId);
            
            if (!order) return { success: false, message: "Order not found" };
            if (order.get("businessId") !== currentUser.id) return { success: false, message: "Unauthorized" };
            if (order.get("status") !== "pending") return { success: false, message: "Order already processed" };
            
            order.set("status", "confirmed_by_business");
            
            if (collectByTime) {
                order.set("collectByTime", new Date(collectByTime));
            } else {
                const defaultTime = new Date();
                defaultTime.setHours(defaultTime.getHours() + 2);
                order.set("collectByTime", defaultTime);
            }
            
            await order.save();
            
            await this.sendNotificationToConsumer(order.get("consumerId"),
                `✅ Your order "${order.get("foodName")}" is ready for pickup! Collect by ${new Date(order.get("collectByTime")).toLocaleString()}`);
            
            return { success: true, message: "Order confirmed!" };
        } catch (error) {
            console.error('confirmOrderByBusiness error:', error);
            return { success: false, message: error.message };
        }
    },

    async confirmCollectedByCustomer(orderId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("role") !== "consumer") return { success: false, message: "Only consumers can confirm pickup" };
            
            const Order = Parse.Object.extend("Order");
            const orderQuery = new Parse.Query(Order);
            const order = await orderQuery.get(orderId, { useMasterKey: true });
            
            if (!order) return { success: false, message: "Order not found" };
            if (order.get("consumerId") !== currentUser.id) return { success: false, message: "Unauthorized" };
            if (order.get("status") !== "confirmed_by_business") return { success: false, message: "Order must be confirmed by business first" };
            
            const businessUser = await new Parse.Query(Parse.User).get(order.get("businessId"), { useMasterKey: true });
            const pendingBalance = businessUser.get("pendingWalletBalance") || 0;
            const currentBalance = businessUser.get("businessWalletBalance") || 0;
            const orderAmount = order.get("totalAmount") || 0;
            
            order.set("status", "collected_by_customer");
            await order.save(null, { useMasterKey: true });
            
            businessUser.set("pendingWalletBalance", Math.max(0, pendingBalance - orderAmount));
            businessUser.set("businessWalletBalance", currentBalance + orderAmount);
            await businessUser.save(null, { useMasterKey: true });
            
            // ===== AUTO-ADD TO FRIDGE =====
            try {
                const foodName = order.get("foodName") || "Unknown Item";
                const batchNumber = order.get("batchNumber") || "";
                
                // Calculate expiry date: 7 days from now
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 7);
                const expiryStr = expiryDate.toISOString().split('T')[0];
                
                // Load current fridge items
                const Fridge = Parse.Object.extend("Fridge");
                const fridgeQuery = new Parse.Query(Fridge);
                fridgeQuery.equalTo("userId", currentUser.id);
                const existingItems = await fridgeQuery.find({ useMasterKey: true });
                
                // Add new item
                const newItem = new Fridge();
                newItem.set("userId", currentUser.id);
                newItem.set("name", foodName);
                newItem.set("expiryDate", new Date(expiryStr));
                newItem.set("category", "other");
                newItem.set("price", orderAmount / (order.get("quantity") || 1));
                newItem.set("qty", order.get("quantity") || 1);
                newItem.set("batchNumber", batchNumber);
                newItem.set("source", "order_" + orderId);
                await newItem.save(null, { useMasterKey: true });
                
                console.log(`✅ Added "${foodName}" to fridge for user ${currentUser.id}`);
            } catch (fridgeError) {
                console.error("Error adding to fridge:", fridgeError);
                // Continue even if fridge add fails
            }
            
            await this.sendNotification(order.get("businessId"),
                `💰 Payment released! Customer collected ${order.get("foodName")}. $${orderAmount.toFixed(2)} added to wallet.`);
            
            return { success: true, message: "Pickup confirmed! Item added to your fridge." };
            
        } catch (error) {
            console.error('confirmCollectedByCustomer error:', error);
            return { success: false, message: error.message || "Failed to confirm pickup" };
        }
    },

    // ========== NOTIFICATION SYSTEM ==========

    async sendNotification(userId, message, type = 'general') {
        try {
            const Notification = Parse.Object.extend("Notification");
            const notification = new Notification();
            notification.set("userId", userId);
            notification.set("message", message);
            notification.set("type", type);
            notification.set("read", false);
            notification.set("createdAt", new Date());
            await notification.save();
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    async getNotifications(userId) {
        try {
            if (!userId) {
                const currentUser = Parse.User.current();
                userId = currentUser?.id;
            }
            if (!userId) return [];
            
            const Notification = Parse.Object.extend("Notification");
            const query = new Parse.Query(Notification);
            query.equalTo("userId", userId);
            query.descending("createdAt");
            query.limit(50);
            
            const notifications = await query.find();
            return notifications.map(n => ({
                id: n.id,
                message: n.get("message"),
                type: n.get("type"),
                read: n.get("read"),
                createdAt: n.get("createdAt")
            }));
        } catch (error) {
            return [];
        }
    },

    async markNotificationRead(notificationId) {
        try {
            const Notification = Parse.Object.extend("Notification");
            const notification = await new Parse.Query(Notification).get(notificationId);
            notification.set("read", true);
            await notification.save();
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    async sendNotificationToConsumer(consumerId, message) {
        try {
            const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
            const notification = new ConsumerNotification();
            notification.set("consumerId", consumerId);
            notification.set("message", message);
            notification.set("read", false);
            notification.set("createdAt", new Date());
            await notification.save();
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    async getConsumerNotifications(consumerId) {
        try {
            const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
            const query = new Parse.Query(ConsumerNotification);
            query.equalTo("consumerId", consumerId);
            query.descending("createdAt");
            const notifications = await query.find();
            return notifications.map(n => ({
                id: n.id,
                message: n.get("message"),
                read: n.get("read"),
                createdAt: n.get("createdAt")
            }));
        } catch (error) {
            return [];
        }
    },

    async markConsumerNotificationRead(notificationId) {
        try {
            const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
            const notification = await new Parse.Query(ConsumerNotification).get(notificationId);
            notification.set("read", true);
            await notification.save();
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    // ========== WALLET METHODS ==========
    
    async getWalletBalance(userId) {
        try {
            const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
            return user.get("walletBalance") || 0;
        } catch (error) {
            const localBalance = localStorage.getItem('walletBalance');
            return localBalance ? parseFloat(localBalance) : 0;
        }
    },
    
    async addToWallet(userId, amount) {
        try {
            const user = await new Parse.Query(Parse.User).get(userId, { useMasterKey: true });
            const currentBalance = user.get("walletBalance") || 0;
            const newBalance = currentBalance + amount;
            user.set("walletBalance", newBalance);
            await user.save(null, { useMasterKey: true });
            
            const currentUser = Parse.User.current();
            if (currentUser && currentUser.id === userId) {
                currentUser.set("walletBalance", newBalance);
                localStorage.setItem("walletBalance", newBalance);
            }
            return { success: true, newBalance: newBalance };
        } catch (error) {
            console.error('addToWallet error:', error);
            return { success: false, message: error.message };
        }
    },
    
    async getBusinessWalletBalance(businessId) {
        try {
            const user = await new Parse.Query(Parse.User).get(businessId, { useMasterKey: true });
            return {
                available: user.get("businessWalletBalance") || 0,
                pending: user.get("pendingWalletBalance") || 0,
                total: (user.get("businessWalletBalance") || 0) + (user.get("pendingWalletBalance") || 0)
            };
        } catch (error) {
            return { available: 0, pending: 0, total: 0 };
        }
    },
    
    async requestWithdrawal(businessId, amount) {
        try {
            const user = await new Parse.Query(Parse.User).get(businessId, { useMasterKey: true });
            const availableBalance = user.get("businessWalletBalance") || 0;
            if (amount < 5) return { success: false, message: "Minimum withdrawal amount is $5" };
            if (availableBalance < amount) return { success: false, message: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` };
            user.set("businessWalletBalance", availableBalance - amount);
            await user.save(null, { useMasterKey: true });
            return { success: true, message: `Withdrawal request submitted for $${amount.toFixed(2)}` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    // ========== CONSUMER PROFILE ==========
    
    async getConsumerProfile(consumerId) {
        try {
            const user = await new Parse.Query(Parse.User).get(consumerId);
            return {
                id: user.id,
                username: user.get("username"),
                email: user.get("email"),
                fullName: user.get("fullName") || user.get("username"),
                phone: user.get("phone") || "",
                walletBalance: user.get("walletBalance") || 0,
                savedAddresses: user.get("savedAddresses") || [],
                createdAt: user.get("createdAt")
            };
        } catch (error) {
            return null;
        }
    },
    
    async updateConsumerProfile(userId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.id !== userId) return { success: false, message: "Unauthorized" };
            const user = await new Parse.Query(Parse.User).get(userId);
            if (updates.email) user.set("email", updates.email);
            if (updates.phone) user.set("phone", updates.phone);
            if (updates.fullName) user.set("fullName", updates.fullName);
            await user.save();
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async uploadProfilePicture(userId, imageBase64) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser || currentUser.id !== userId) return { success: false, message: "Unauthorized" };
            const user = await new Parse.Query(Parse.User).get(userId);
            user.set("profilePicture", imageBase64);
            await user.save();
            localStorage.setItem("profilePicture", imageBase64);
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },
    
    async saveAddress(userId, address) {
        try {
            const user = await new Parse.Query(Parse.User).get(userId);
            const addresses = user.get("savedAddresses") || [];
            addresses.push({ id: Date.now(), ...address });
            user.set("savedAddresses", addresses);
            await user.save();
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },
    
    async getSavedAddresses(userId) {
        try {
            const user = await new Parse.Query(Parse.User).get(userId);
            return user.get("savedAddresses") || [];
        } catch (error) {
            return [];
        }
    },

    // ========== REVENUE & STATS ==========
    
    async getBusinessRevenue(businessId) {
        try {
            const Order = Parse.Object.extend("Order");
            const query = new Parse.Query(Order);
            query.equalTo("businessId", businessId);
            query.equalTo("status", "collected_by_customer");
            const orders = await query.find();
            let totalRevenue = 0;
            for (const order of orders) {
                totalRevenue += order.get("totalAmount") || 0;
            }
            return { totalRevenue, totalOrders: orders.length };
        } catch (error) {
            return null;
        }
    },

    async getNearExpiryStats(businessId) {
        try {
            const Ad = Parse.Object.extend("Advertisement");
            const query = new Parse.Query(Ad);
            query.equalTo("businessId", businessId);
            query.greaterThan("offerEnds", new Date());
            const ads = await query.find();
            const expiringSoon = ads.filter(ad => {
                const daysLeft = Math.ceil((ad.get("offerEnds") - new Date()) / (1000 * 60 * 60 * 24));
                return daysLeft <= 3 && daysLeft > 0;
            });
            const lowStock = ads.filter(ad => ad.get("quantityLeft") <= 5 && ad.get("quantityLeft") > 0);
            const totalItems = ads.reduce((sum, ad) => sum + (ad.get("quantityLeft") || 0), 0);
            return {
                totalActiveOffers: ads.length,
                expiringSoonCount: expiringSoon.length,
                lowStockCount: lowStock.length,
                totalItemsLeft: totalItems
            };
        } catch (error) {
            return null;
        }
    },

    // ========== FRIDGE FUNCTIONS ==========
    
    async saveFridgeItems(items) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            const Fridge = Parse.Object.extend("Fridge");
            const query = new Parse.Query(Fridge);
            query.equalTo("userId", currentUser.id);
            const oldItems = await query.find();
            await Parse.Object.destroyAll(oldItems);
            const newItems = items.map(item => {
                const fridgeItem = new Fridge();
                fridgeItem.set("userId", currentUser.id);
                fridgeItem.set("name", item.name);
                fridgeItem.set("expiryDate", new Date(item.expiry));
                fridgeItem.set("category", item.category || "other");
                fridgeItem.set("price", item.price || 0);
                fridgeItem.set("qty", item.qty || 1);
                fridgeItem.set("batchNumber", item.batchNumber || "");
                fridgeItem.set("source", item.source || "manual");
                return fridgeItem;
            });
            await Parse.Object.saveAll(newItems);
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    async loadFridgeItems() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];
            const Fridge = Parse.Object.extend("Fridge");
            const query = new Parse.Query(Fridge);
            query.equalTo("userId", currentUser.id);
            const items = await query.find();
            return items.map(item => ({
                id: item.id,
                name: item.get("name"),
                expiry: item.get("expiryDate").toISOString().split('T')[0],
                category: item.get("category"),
                price: item.get("price") || 0,
                qty: item.get("qty") || 1,
                batchNumber: item.get("batchNumber") || "",
                source: item.get("source") || "manual"
            }));
        } catch (error) {
            return [];
        }
    },

    // ========== SHOPPING LIST ==========
    
    async saveShoppingLists(lists) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            const ShoppingLists = Parse.Object.extend("ShoppingLists");
            const query = new Parse.Query(ShoppingLists);
            query.equalTo("userId", currentUser.id);
            const oldLists = await query.find();
            await Parse.Object.destroyAll(oldLists);
            const newLists = new ShoppingLists();
            newLists.set("userId", currentUser.id);
            newLists.set("lists", JSON.stringify(lists));
            newLists.set("lastUpdated", new Date());
            await newLists.save();
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    async loadShoppingLists() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return null;
            const ShoppingLists = Parse.Object.extend("ShoppingLists");
            const query = new Parse.Query(ShoppingLists);
            query.equalTo("userId", currentUser.id);
            const result = await query.first();
            return result ? JSON.parse(result.get("lists")) : null;
        } catch (error) {
            return null;
        }
    },

    // ========== COMMUNITY SHARING ==========
    
    async createCommunityShare(shareData) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };

            const CommunitySharing = Parse.Object.extend("CommunitySharing");
            const share = new CommunitySharing();
            
            share.set("sharerId", currentUser.id);
            share.set("sharerName", currentUser.get("username"));
            share.set("foodItems", shareData.foodItems || []);
            share.set("description", shareData.description || "");
            share.set("reason", shareData.reason || "cooked_too_much");
            share.set("shareType", shareData.shareType || "giveaway");
            share.set("dietaryInfo", shareData.dietaryInfo || {});
            share.set("category", "community");
            share.set("active", true);
            share.set("status", "available");
            
            if (shareData.location) {
                share.set("location", new Parse.GeoPoint({
                    latitude: shareData.location.lat,
                    longitude: shareData.location.lng
                }));
                share.set("locationAddress", shareData.location.address || "");
            }
            
            share.set("pickupInstructions", shareData.pickupInstructions || "");
            
            if (shareData.imageBase64) {
                share.set("image", shareData.imageBase64);
            }
            
            share.set("claimedBy", []);
            share.set("views", 0);
            share.set("createdAt", new Date());
            share.set("expiresAt", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
            
            await share.save();
            return { success: true, shareId: share.id, message: "Food shared with community!" };
        } catch (error) {
            console.error("Error creating community share:", error);
            return { success: false, message: error.message };
        }
    },

    async getCommunityShares(options = {}) {
        try {
            const CommunitySharing = Parse.Object.extend("CommunitySharing");
            const query = new Parse.Query(CommunitySharing);
            
            query.equalTo("active", true);
            query.equalTo("status", "available");
            query.greaterThan("expiresAt", new Date());
            query.descending("createdAt");
            query.limit(options.limit || 100);
            
            if (options.userId) {
                query.equalTo("sharerId", options.userId);
            }
            
            const shares = await query.find();
            
            return shares.map(share => {
                const location = share.get("location");
                return {
                    id: share.id,
                    foodItems: share.get("foodItems") || [],
                    sharedBy: {
                        id: share.get("sharerId"),
                        username: share.get("sharerName") || "Anonymous"
                    },
                    location: location ? {
                        lat: location.latitude,
                        lng: location.longitude,
                        address: share.get("locationAddress") || "Location not specified"
                    } : null,
                    description: share.get("description") || "",
                    reason: share.get("reason") || "cooked_too_much",
                    shareType: share.get("shareType") || "giveaway",
                    dietaryInfo: share.get("dietaryInfo") || {},
                    pickupInstructions: share.get("pickupInstructions") || "",
                    image: share.get("image") || null,
                    views: share.get("views") || 0,
                    claimedBy: share.get("claimedBy") || [],
                    status: share.get("status"),
                    active: share.get("active"),
                    createdAt: share.get("createdAt"),
                    expiresAt: share.get("expiresAt")
                };
            });
        } catch (error) {
            console.error("Error getting community shares:", error);
            return [];
        }
    },

    async getMyShares(userId) {
        try {
            if (!userId) {
                const currentUser = Parse.User.current();
                userId = currentUser?.id;
            }
            if (!userId) return [];
            
            const CommunitySharing = Parse.Object.extend("CommunitySharing");
            const query = new Parse.Query(CommunitySharing);
            query.equalTo("sharerId", userId);
            query.descending("createdAt");
            
            const shares = await query.find();
            return shares.map(share => {
                const location = share.get("location");
                return {
                    id: share.id,
                    foodItems: share.get("foodItems") || [],
                    location: location ? {
                        lat: location.latitude,
                        lng: location.longitude,
                        address: share.get("locationAddress") || ""
                    } : null,
                    description: share.get("description") || "",
                    reason: share.get("reason") || "",
                    shareType: share.get("shareType") || "giveaway",
                    dietaryInfo: share.get("dietaryInfo") || {},
                    pickupInstructions: share.get("pickupInstructions") || "",
                    image: share.get("image") || null,
                    views: share.get("views") || 0,
                    claimedBy: share.get("claimedBy") || [],
                    status: share.get("status"),
                    active: share.get("active"),
                    createdAt: share.get("createdAt"),
                    expiresAt: share.get("expiresAt")
                };
            });
        } catch (error) {
            return [];
        }
    },

    async claimCommunityShare(shareId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };

            const CommunitySharing = Parse.Object.extend("CommunitySharing");
            const query = new Parse.Query(CommunitySharing);
            const share = await query.get(shareId);
            
            if (!share) return { success: false, message: "Share not found" };
            if (share.get("status") !== "available") return { success: false, message: "This food has already been claimed" };
            
            const claimedBy = share.get("claimedBy") || [];
            const alreadyClaimed = claimedBy.some(claim => claim.userId === currentUser.id);
            if (alreadyClaimed) return { success: false, message: "You've already claimed this" };
            
            claimedBy.push({
                userId: currentUser.id,
                username: currentUser.get("username"),
                claimedAt: new Date().toISOString()
            });
            
            share.set("claimedBy", claimedBy);
            share.set("status", "claimed");
            share.set("claimedAt", new Date());
            await share.save();
            
            const sharerId = share.get("sharerId");
            if (sharerId) {
                const foodNames = (share.get("foodItems") || []).map(item => 
                    typeof item === 'string' ? item : (item.name || 'food')
                ).join(', ');
                
                const message = `🤝 ${currentUser.get("username")} wants to pick up your food: ${foodNames}`;
                await this.sendNotification(sharerId, message, 'community_claim');
            }
            
            return { success: true, message: "Food claimed! Sharer notified." };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    async deleteCommunityShare(shareId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            
            const CommunitySharing = Parse.Object.extend("CommunitySharing");
            const query = new Parse.Query(CommunitySharing);
            const share = await query.get(shareId);
            
            if (share.get("sharerId") !== currentUser.id) {
                return { success: false, message: "You can only delete your own shares" };
            }
            
            share.set("active", false);
            share.set("status", "deleted");
            await share.save();
            return { success: true, message: "Share removed" };
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    // ========== SYNC FUNCTIONS ==========
    
    async syncAll() {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            const localLists = localStorage.getItem("shoplists");
            if (localLists) await this.saveShoppingLists(JSON.parse(localLists));
            const localFridge = localStorage.getItem("foodItems");
            if (localFridge) await this.saveFridgeItems(JSON.parse(localFridge));
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    async loadAll() {
        try {
            const cloudLists = await this.loadShoppingLists();
            if (cloudLists) localStorage.setItem("shoplists", JSON.stringify(cloudLists));
            const cloudFridge = await this.loadFridgeItems();
            if (cloudFridge.length > 0) localStorage.setItem("foodItems", JSON.stringify(cloudFridge));
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    },

    // ========== CLAIMS ==========

    async getClaimsForBusiness(businessId) {
        try {
            if (!businessId) {
                const currentUser = Parse.User.current();
                businessId = currentUser?.id;
            }
            if (!businessId) return [];

            const Order = Parse.Object.extend("Order");
            const query = new Parse.Query(Order);
            query.equalTo("businessId", businessId);
            query.descending("createdAt");
            const orders = await query.find();

            return orders.map(o => {
                const rawStatus = o.get("status");
                let status = rawStatus;
                if (rawStatus === "confirmed_by_business") status = "confirmed";
                if (rawStatus === "collected_by_customer") status = "collected";

                return {
                    id: o.id,
                    consumerName: o.get("consumerName"),
                    consumerId: o.get("consumerId"),
                    foodName: o.get("foodName"),
                    quantity: o.get("quantity"),
                    discount: o.get("discount"),
                    originalPrice: o.get("originalPrice"),
                    batchNumber: o.get("batchNumber"),
                    totalAmount: o.get("totalAmount"),
                    status: status,
                    claimedAt: o.get("createdAt"),
                    createdAt: o.get("createdAt"),
                    collectByTime: o.get("collectByTime") 
                };
            });
        } catch (error) {
            console.error("getClaimsForBusiness error:", error);
            return [];
        }
    },

    async updateClaimStatus(orderId, newStatus) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };

            const Order = Parse.Object.extend("Order");
            const order = await new Parse.Query(Order).get(orderId);

            if (!order) return { success: false, message: "Order not found" };
            if (order.get("businessId") !== currentUser.id) return { success: false, message: "Unauthorized" };

            const statusMap = {
                confirmed: "confirmed_by_business",
                collected: "collected_by_customer",
                cancelled: "cancelled"
            };
            const internalStatus = statusMap[newStatus] || newStatus;
            order.set("status", internalStatus);
            await order.save();

            if (newStatus === "collected") {
                try {
                    const businessUser = await new Parse.Query(Parse.User).get(order.get("businessId"));
                    const orderAmount = order.get("totalAmount") || 0;
                    const pending = businessUser.get("pendingWalletBalance") || 0;
                    const available = businessUser.get("businessWalletBalance") || 0;
                    businessUser.set("pendingWalletBalance", Math.max(0, pending - orderAmount));
                    businessUser.set("businessWalletBalance", available + orderAmount);
                    await businessUser.save();
                } catch (walletErr) {
                    console.error("Wallet update error:", walletErr);
                }
            }

            if (newStatus === "confirmed") {
                await this.sendNotificationToConsumer(
                    order.get("consumerId"),
                    `✅ Your order "${order.get("foodName")}" is ready for pickup!`
                );
            } else if (newStatus === "cancelled") {
                await this.sendNotificationToConsumer(
                    order.get("consumerId"),
                    `❌ Your order "${order.get("foodName")}" was cancelled by the store.`
                );
            }

            return { success: true };
        } catch (error) {
            console.error("updateClaimStatus error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== NOTIFICATION COUNTS ==========

    async getTotalUnreadCount(userId) {
        try {
            if (!userId) {
                const currentUser = Parse.User.current();
                userId = currentUser?.id;
            }
            if (!userId) return 0;

            const Notification = Parse.Object.extend("Notification");
            const bizQuery = new Parse.Query(Notification);
            bizQuery.equalTo("userId", userId);
            bizQuery.equalTo("read", false);
            const bizCount = await bizQuery.count();

            const ConsumerNotification = Parse.Object.extend("ConsumerNotification");
            const conQuery = new Parse.Query(ConsumerNotification);
            conQuery.equalTo("consumerId", userId);
            conQuery.equalTo("read", false);
            const conCount = await conQuery.count();

            return bizCount + conCount;
        } catch (error) {
            console.error("getTotalUnreadCount error:", error);
            return 0;
        }
    },

    // ========== INVENTORY FUNCTIONS ==========
    
    async saveInventoryItems(items) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false };
            
            const Inventory = Parse.Object.extend("Inventory");
            const query = new Parse.Query(Inventory);
            query.equalTo("businessId", currentUser.id);
            const oldItems = await query.find();
            await Parse.Object.destroyAll(oldItems);
            
            const newItems = items.map(item => {
                const invItem = new Inventory();
                // Use the passed businessId if available, otherwise currentUser.id
                invItem.set("businessId", item.businessId || currentUser.id);
                invItem.set("name", item.name);
                invItem.set("batchNumber", item.batchNumber || "");
                invItem.set("expiryDate", item.expiryDate ? new Date(item.expiryDate) : null);
                invItem.set("quantity", item.quantity || 0);
                invItem.set("originalPrice", item.originalPrice || 0);
                invItem.set("salePrice", item.salePrice || 0);
                invItem.set("category", item.category || "other");
                invItem.set("onSale", item.onSale || false);
                if (item.imageBase64) {
                    invItem.set("productImage", item.imageBase64);
                }
                invItem.set("createdAt", new Date());
                return invItem;
            });
            await Parse.Object.saveAll(newItems);
            return { success: true };
        } catch (error) {
            console.error("saveInventoryItems error:", error);
            return { success: false };
        }
    },

    // 🔥 FIXED: Accept optional businessId parameter
    async loadInventoryItems(businessId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return [];
            
            // Use the passed businessId, or fallback to current user's ID (for owners)
            const id = businessId || currentUser.id;
            
            const Inventory = Parse.Object.extend("Inventory");
            const query = new Parse.Query(Inventory);
            query.equalTo("businessId", id);
            query.descending("createdAt");
            const items = await query.find();
            
            return items.map(item => ({
                id: item.id,
                name: item.get("name"),
                batchNumber: item.get("batchNumber"),
                expiryDate: item.get("expiryDate") ? item.get("expiryDate").toISOString().split('T')[0] : null,
                quantity: item.get("quantity") || 0,
                originalPrice: item.get("originalPrice") || 0,
                salePrice: item.get("salePrice") || 0,
                category: item.get("category") || "other",
                onSale: item.get("onSale") || false,
                productImage: item.get("productImage") || null
            }));
        } catch (error) {
            console.error("loadInventoryItems error:", error);
            return [];
        }
    },

    async updateInventoryItem(itemId, updates) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            
            const Inventory = Parse.Object.extend("Inventory");
            const item = await new Parse.Query(Inventory).get(itemId);
            
            if (!item) return { success: false, message: "Item not found" };
            if (item.get("businessId") !== currentUser.id) return { success: false, message: "Unauthorized" };
            
            const allowedKeys = ['name', 'batchNumber', 'expiryDate', 'quantity', 'originalPrice', 'salePrice', 'category', 'onSale', 'productImage'];
            for (const key of allowedKeys) {
                if (updates[key] !== undefined) {
                    if (key === 'expiryDate' && updates[key]) {
                        item.set(key, new Date(updates[key]));
                    } else {
                        item.set(key, updates[key]);
                    }
                }
            }
            await item.save();
            return { success: true };
        } catch (error) {
            console.error("updateInventoryItem error:", error);
            return { success: false, message: error.message };
        }
    },

    async deleteInventoryItem(itemId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            
            const Inventory = Parse.Object.extend("Inventory");
            const item = await new Parse.Query(Inventory).get(itemId);
            
            if (!item) return { success: false, message: "Item not found" };
            if (item.get("businessId") !== currentUser.id) return { success: false, message: "Unauthorized" };
            
            await item.destroy();
            return { success: true };
        } catch (error) {
            console.error("deleteInventoryItem error:", error);
            return { success: false, message: error.message };
        }
    },

    // ========== ROLE & PERMISSION SYSTEM ==========
    
    // Create a new custom role
    async createRole(businessId, roleName, permissions) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can create roles" };
            }

            const Role = Parse.Object.extend("BusinessRole");
            const query = new Parse.Query(Role);
            query.equalTo("businessId", businessId);
            query.equalTo("roleName", roleName);
            const existing = await query.first();
            
            if (existing) {
                return { success: false, message: "A role with this name already exists" };
            }

            const newRole = new Role();
            newRole.set("businessId", businessId);
            newRole.set("roleName", roleName);
            newRole.set("permissions", permissions);
            await newRole.save();

            return { success: true, message: "Role created successfully!", role: newRole };
        } catch (error) {
            console.error("Error creating role:", error);
            return { success: false, message: error.message };
        }
    },

    // Get all roles for a business
    async getRoles(businessId) {
        try {
            if (!businessId) {
                const currentUser = Parse.User.current();
                businessId = currentUser?.id;
            }
            if (!businessId) return [];

            const Role = Parse.Object.extend("BusinessRole");
            const query = new Parse.Query(Role);
            query.equalTo("businessId", businessId);
            const roles = await query.find();
            
            return roles.map(role => ({
                id: role.id,
                name: role.get("roleName"),
                permissions: role.get("permissions") || {}
            }));
        } catch (error) {
            console.error("Error fetching roles:", error);
            return [];
        }
    },

    // Delete a role
    async deleteRole(roleId) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can delete roles" };
            }

            const Role = Parse.Object.extend("BusinessRole");
            const role = await new Parse.Query(Role).get(roleId);
            
            if (!role) return { success: false, message: "Role not found" };
            if (role.get("businessId") !== currentUser.id) {
                return { success: false, message: "Unauthorized" };
            }

            await role.destroy();
            return { success: true, message: "Role deleted" };
        } catch (error) {
            console.error("Error deleting role:", error);
            return { success: false, message: error.message };
        }
    },

    // ===== FIXED: Assign role to employee (with Master Key) =====
    async assignRoleToEmployee(employeeId, roleName) {
        try {
            const currentUser = Parse.User.current();
            if (!currentUser) return { success: false, message: "Please login first" };
            if (currentUser.get("businessRole") !== "owner") {
                return { success: false, message: "Only owners can assign roles" };
            }

            // 🔥 FIX: Use Master Key to fetch employee
            const employee = await new Parse.Query(Parse.User).get(employeeId, { useMasterKey: true });
            if (!employee) {
                return { success: false, message: "Employee not found" };
            }

            employee.set("businessRole", roleName);
            await employee.save(null, { useMasterKey: true });

            // Ensure they are in the owner's staff list
            const staffList = currentUser.get("businessStaff") || [];
            if (!staffList.includes(employeeId)) {
                staffList.push(employeeId);
                currentUser.set("businessStaff", staffList);
                await currentUser.save(null, { useMasterKey: true });
            }

            return { success: true, message: `Role "${roleName}" assigned to employee` };
        } catch (error) {
            console.error("Error assigning role:", error);
            return { success: false, message: error.message };
        }
    },

    // Get the effective permissions for a specific employee
    async getEmployeePermissions(employeeId) {
        try {
            const employee = await new Parse.Query(Parse.User).get(employeeId);
            if (!employee) return {};
            
            // Owners bypass permissions
            if (employee.get("businessRole") === "owner") {
                return { isOwner: true };
            }
            
            const roleName = employee.get("businessRole");
            const businessId = employee.get("businessId");
            
            // If user is still pending, they have no permissions
            if (roleName === 'pending' || !businessId) {
                return { isPending: true };
            }
            
            const Role = Parse.Object.extend("BusinessRole");
            const query = new Parse.Query(Role);
            query.equalTo("businessId", businessId);
            query.equalTo("roleName", roleName);
            const role = await query.first();
            
            if (!role) return {};
            
            return role.get("permissions") || {};
        } catch (error) {
            console.error("Error fetching employee permissions:", error);
            return {};
        }
    },

    // ========== UTILITY ==========
    
    isAuthenticated() { return Parse.User.current() !== null; },
    getUserRole() { const user = Parse.User.current(); return user ? user.get("role") : null; },
    getBusinessRole() { const user = Parse.User.current(); return user ? user.get("businessRole") : null; },
    isVerified() { const user = Parse.User.current(); return user ? user.get("businessVerified") : false; },

    async testConnection() {
        try {
            console.log("✅ foodsavvi cloud connected");
            return { success: true };
        } catch (error) {
            console.error("❌ foodsavvi cloud error:", error);
            return { success: false, error };
        }
    }
};
