import { useAuth } from "@/context/AuthContext";
import {
  getUserProfile,
  updateUserProfile,
  uploadProfilePicture,
  UserProfile,
} from "@/services/userService";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { generateQRData } from "@/services/qrService";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user]);


  const QRCodeModal = () => {
    if (!profile) return null;

    return (
      <View style={styles.qrModal}>
        <View style={styles.qrContainer}>
          <Text style={styles.qrTitle}>My QR Code</Text>
          <Text style={styles.qrSubtitle}>Let others scan this to add you</Text>

          <View style={styles.qrCodeWrapper}>
            <QRCode
              value={generateQRData(profile)}
              size={200}
              backgroundColor="white"
              color="black"
            />
          </View>

          <TouchableOpacity
            style={styles.qrCloseButton}
            onPress={() => setShowQR(false)}
          >
            <Text style={styles.qrCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const loadUserProfile = async () => {
    if (!user) return;

    const userProfile = await getUserProfile(user.uid);
    if (userProfile) {
      setProfile(userProfile);
      setDisplayName(userProfile.displayName || "");
      setBio(userProfile.bio || "");
    }
  };

  const handleImagePicker = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please grant permission to access your photos"
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && user) {
      setLoading(true);
      const imageUrl = await uploadProfilePicture(
        user.uid,
        result.assets[0].uri
      );
      if (imageUrl) {
        await updateUserProfile(user.uid, { profilePicture: imageUrl });
        await loadUserProfile();
      }
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setLoading(true);
    const success = await updateUserProfile(user.uid, {
      displayName,
      bio,
    });

    if (success) {
      Alert.alert("Success", "Profile updated successfully");
      setEditing(false);
      await loadUserProfile();
    } else {
      Alert.alert("Error", "Failed to update profile");
    }
    setLoading(false);
  };

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleImagePicker}
          style={styles.imageContainer}
        >
          {profile.profilePicture ? (
            <Image
              source={{ uri: profile.profilePicture }}
              style={styles.profileImage}
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>
                {profile.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.changePhotoText}>Change Photo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <Text style={styles.value}>{profile.username}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile.email}</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Display Name</Text>
          {editing ? (
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter display name"
            />
          ) : (
            <Text style={styles.value}>{displayName || "Not set"}</Text>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Bio</Text>
          {editing ? (
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Enter bio"
              multiline
              numberOfLines={3}
            />
          ) : (
            <Text style={styles.value}>{bio || "Not set"}</Text>
          )}
        </View>
        <View style={styles.buttons}>
          {editing ? (
            <View style={styles.editButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setEditing(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSaveProfile}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading ? "Saving..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.profileButtons}>
              <TouchableOpacity
                style={[styles.button, styles.editButton]}
                onPress={() => setEditing(true)}
              >
                <Text style={styles.buttonText}>Edit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.qrButton]}
                onPress={() => setShowQR(true)}
              >
                <Text style={styles.buttonText}>Show QR Code</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {showQR && <QRCodeModal />}
        {!showQR && (
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    alignItems: "center",
    paddingVertical: 30,
    backgroundColor: "#f8f9fa",
  },
  imageContainer: {
    alignItems: "center",
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  placeholderImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "bold",
  },
  changePhotoText: {
    color: "#007AFF",
    fontSize: 16,
    marginTop: 10,
  },
  content: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
  },
  value: {
    fontSize: 16,
    color: "#666",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  buttons: {
    marginTop: 20,
  },
  editButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  cancelButton: {
    backgroundColor: "#666",
    marginRight: 10,
  },
  saveButton: {
    marginLeft: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#ff3b30",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 30,
  },
  logoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  profileButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  editButton: {
    flex: 1,
    marginRight: 8,
  },
  qrButton: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: "#34C759",
  },
  qrModal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  qrContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 30,
    alignItems: "center",
    margin: 20,
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
  },
  qrSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },
  qrCodeWrapper: {
    padding: 20,
    backgroundColor: "white",
    borderRadius: 8,
    marginBottom: 20,
  },
  qrCloseButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  qrCloseButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
