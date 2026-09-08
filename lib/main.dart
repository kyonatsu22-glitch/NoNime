import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF11161D),
        primaryColor: const Color(0xFF0088FF),
      ),
      home: const MainScreen(),
    );
  }
}

class Anime {
  final int id;
  final String titleRomaji;
  final String image;
  String dayOfWeek;
  final String status;
  int currentEpisode;
  final int? nextAiringEpisodeNum;
  final int? nextAiringAt;
  final String? startDateStr;
  final String? endDateStr;

  Anime({
    required this.id,
    required this.titleRomaji,
    required this.image,
    required this.dayOfWeek,
    required this.status,
    required this.currentEpisode,
    this.nextAiringEpisodeNum,
    this.nextAiringAt,
    this.startDateStr,
    this.endDateStr,
  });

  String get displayTitle => titleRomaji;

  factory Anime.fromJson(Map<String, dynamic> json) {
    var t = json['title'] ?? {};
    String airingDay = 'Senin';
    int latestEp = json['episodes'] ?? 12;
    String statusAnime = json['status'] ?? 'RELEASING';
    int? nextEpNum;
    int? airingAt;

    var startObj = json['startDate'];
    String? startStr;
    if (startObj != null && startObj['year'] != null) {
      startStr = '${startObj['day'] ?? '?'}-${startObj['month'] ?? '?'}-${startObj['year']}';
    }

    var endObj = json['endDate'];
    String? endStr;
    if (endObj != null && endObj['year'] != null) {
      endStr = '${endObj['day'] ?? '?'}-${endObj['month'] ?? '?'}-${endObj['year']}';
    }

    var nextAiring = json['nextAiringEpisode'];
    if (nextAiring != null && nextAiring['airingAt'] != null) {
      airingAt = nextAiring['airingAt'];
      nextEpNum = nextAiring['episode'];
      
      DateTime date = DateTime.fromMillisecondsSinceEpoch(airingAt! * 1000, isUtc: true).toLocal();

      List<String> days = ['Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu', 'Senin'];
      airingDay = days[date.weekday - 1];
      
      if (nextEpNum != null && nextEpNum > 1) {
        latestEp = nextEpNum - 1;
      }
    }

    return Anime(
      id: json['id'] ?? 0,
      titleRomaji: t['romaji'] ?? 'Tanpa Judul',
      image: json['coverImage']?['large'] ?? '',
      dayOfWeek: airingDay,
      status: statusAnime,
      currentEpisode: latestEp > 0 ? latestEp : 12,
      nextAiringEpisodeNum: nextEpNum,
      nextAiringAt: airingAt,
      startDateStr: startStr,
      endDateStr: endStr,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'titleRomaji': titleRomaji,
        'image': image,
        'dayOfWeek': dayOfWeek,
        'status': status,
        'currentEpisode': currentEpisode,
        'nextAiringEpisodeNum': nextAiringEpisodeNum,
        'nextAiringAt': nextAiringAt,
        'startDateStr': startDateStr,
        'endDateStr': endDateStr,
      };

  factory Anime.fromMap(Map<String, dynamic> map) => Anime(
        id: map['id'],
        titleRomaji: map['titleRomaji'] ?? '',
        image: map['image'] ?? '',
        dayOfWeek: map['dayOfWeek'] ?? 'Senin',
        status: map['status'] ?? 'RELEASING',
        currentEpisode: map['currentEpisode'] ?? 12,
        nextAiringEpisodeNum: map['nextAiringEpisodeNum'],
        nextAiringAt: map['nextAiringAt'],
        startDateStr: map['startDateStr'],
        endDateStr: map['endDateStr'],
      );
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _index = 0;
  List<Anime> _ongoingList = [];
  List<Anime> _finishedList = [];
  List<Anime> _manualAnime = [];
  List<Anime> _anilistLibrary = [];
  bool _loading = true;
  Set<int> _bookmarks = {};
  Map<int, List<int>> _watched = {}; 
  Map<int, String> _customTitles = {};
  
  Map<int, String> _animeStatus = {};
  Map<int, int> _animeScore = {};
  Map<int, String> _animeNotes = {};

  String? _anilistToken;
  String? _userName;
  String? _userAvatar;
  int? _userId;

  List<dynamic> _activities = [];
  bool _loadingAcara = true;

  @override
  void initState() {
    super.initState();
    _loadAuthAndData();
    _fetchAcaraData();
  }

  Future<void> _fetchAcaraData() async {
    setState(() => _loadingAcara = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('anilist_token') ?? '';

      int? currentUserId;
      if (token.isNotEmpty) {
        const viewerQuery = '''
          query {
            Viewer {
              id
            }
          }
        ''';
        
        final viewerResponse = await http.post(
          Uri.parse('https://graphql.anilist.co'),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({'query': viewerQuery}),
        );

        if (viewerResponse.statusCode == 200) {
          final data = jsonDecode(viewerResponse.body);
          currentUserId = data['data']?['Viewer']?['id'];
        }
      }

      const query = '''
        query (\$userId: Int) {
          RecentActivities: Page(perPage: 50) {
            activities(userId: \$userId, sort: ID_DESC) {
              __typename
              ... on ListActivity {
                id
                type
                status
                progress
                createdAt
                user { name avatar { large } }
                media { id title { romaji } coverImage { large } }
              }
              ... on TextActivity {
                id
                type
                text
                createdAt
                user { name avatar { large } }
              }
            }
          }
        }
      ''';

      var res = await http.post(
        Uri.parse('https://graphql.anilist.co'),
        headers: {
          'Content-Type': 'application/json',
          if (token.isNotEmpty) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'query': query,
          'variables': {'userId': currentUserId}
        }),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _activities = data['data']?['RecentActivities']?['activities'] ?? [];
          _loadingAcara = false;
        });
      } else {
        setState(() => _loadingAcara = false);
      }
    } catch (_) {
      setState(() => _loadingAcara = false);
    }
  }

  Future<void> _loadAuthAndData() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _anilistToken = prefs.getString('anilist_token');
      _userName = prefs.getString('anilist_username');
      _userAvatar = prefs.getString('anilist_avatar');
      _userId = prefs.getInt('anilist_userid');
      _bookmarks = prefs.getStringList('bm')?.map(int.parse).toSet() ?? {};
      final manualListStr = prefs.getStringList('manual_anime');
      if (manualListStr != null) {
        _manualAnime = manualListStr.map((str) => Anime.fromMap(jsonDecode(str))).toList();
      }
    });

    await _loadData();
    if (_anilistToken != null) {
      if (_userId == null) {
        await _fetchUserProfile();
      }
      await _fetchAnilistLibrary();
    }
  }

  Future<void> _loginAniList() async {
    const clientId = '18537'; 
    final Uri authUrl = Uri.parse('https://anilist.co/api/v2/oauth/authorize?client_id=$clientId&response_type=token');
    try {
      await launchUrl(authUrl, mode: LaunchMode.externalApplication);
      _showTokenInputDialog();
    } catch (_) {}
  }

  void _showTokenInputDialog() {
    final tokenController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey.shade900,
        title: const Text('Masukkan Token AniList', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Setelah login di browser, salin URL redirect atau token dan tempel di bawah:',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: tokenController,
              style: const TextStyle(color: Colors.white, fontSize: 12),
              decoration: const InputDecoration(labelText: 'URL Redirect atau Token'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              String input = tokenController.text.trim();
              String? token;
              if (input.contains('access_token=')) {
                try {
                  final uri = Uri.parse(input.replaceFirst('#', '?'));
                  token = uri.queryParameters['access_token'];
                } catch (_) {}
              }
              if (token == null || token.isEmpty) {
                token = input;
              }

              if (token != null && token.isNotEmpty) {
                final prefs = await SharedPreferences.getInstance();
                await prefs.setString('anilist_token', token);
                setState(() => _anilistToken = token);
                if (context.mounted) Navigator.pop(context);
                await _fetchUserProfile();
                await _fetchAnilistLibrary();
                await _fetchAcaraData();
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  Future<void> _fetchUserProfile() async {
    if (_anilistToken == null) return;
    try {
      var res = await http.post(
        Uri.parse('https://graphql.anilist.co'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_anilistToken',
        },
        body: jsonEncode({'query': '{ Viewer { id name avatar { large } } }'}),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final viewer = data['data']?['Viewer'];
        if (viewer != null) {
          final prefs = await SharedPreferences.getInstance();
          setState(() {
            _userId = viewer['id'];
            _userName = viewer['name'];
            _userAvatar = viewer['avatar']?['large'];
          });
          await prefs.setInt('anilist_userid', _userId ?? 0);
          await prefs.setString('anilist_username', _userName ?? '');
          await prefs.setString('anilist_avatar', _userAvatar ?? '');
        }
      }
    } catch (_) {}
  }

  Future<void> _fetchAnilistLibrary() async {
    if (_anilistToken == null || _userName == null) return;
    try {
      var res = await http.post(
        Uri.parse('https://graphql.anilist.co'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_anilistToken',
        },
        body: jsonEncode({
          'query': '''
            query (\$userName: String) {
              MediaListCollection(userName: \$userName, type: ANIME) {
                lists {
                  name
                  entries {
                    status
                    score
                    progress
                    notes
                    updatedAt
                    media {
                      id
                      title { romaji }
                      coverImage { large }
                      episodes
                      status
                      startDate { year month day }
                      endDate { year month day }
                      nextAiringEpisode { airingAt episode }
                    }
                  }
                }
              }
            }
          ''',
          'variables': {'userName': _userName}
        }),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final collections = data['data']?['MediaListCollection']?['lists'];
        if (collections != null) {
          List<Anime> tempLibrary = [];
          final prefs = await SharedPreferences.getInstance();
          for (var list in collections) {
            var entries = list['entries'] as List?;
            if (entries != null) {
              for (var entry in entries) {
                var media = entry['media'];
                if (media != null) {
                  int animeId = media['id'];
                  Anime parsedAnime = Anime.fromJson(media);
                  tempLibrary.add(parsedAnime);
                  
                  setState(() {
                    if (parsedAnime.status == 'FINISHED') {
                      if (!_finishedList.any((a) => a.id == animeId)) _finishedList.insert(0, parsedAnime);
                    } else {
                      if (!_ongoingList.any((a) => a.id == animeId)) _ongoingList.insert(0, parsedAnime);
                    }
                  });

                  if (entry['status'] != null) {
                    _animeStatus[animeId] = entry['status'];
                    prefs.setString('status_$animeId', entry['status']);
                  }
                  if (entry['score'] != null) {
                    _animeScore[animeId] = (entry['score'] as num).toInt();
                    prefs.setInt('score_$animeId', (entry['score'] as num).toInt());
                  }
                  if (entry['notes'] != null) {
                    _animeNotes[animeId] = entry['notes'];
                    prefs.setString('notes_$animeId', entry['notes']);
                  }
                  
                  List<String>? localEps = prefs.getStringList('eps_$animeId');
                  List<int> currentLocalList = localEps != null ? localEps.map(int.parse).toList() : [];

                  int serverProg = entry['progress'] != null ? (entry['progress'] as num).toInt() : 0;
                  
                  if (currentLocalList.length >= serverProg) {
                    _watched[animeId] = currentLocalList;
                  } else {
                    List<int> epList = [];
                    for (int i = 1; i <= serverProg; i++) {
                      if (!epList.contains(i)) epList.add(i);
                    }
                    _watched[animeId] = epList;
                    prefs.setStringList('eps_$animeId', epList.map((e) => e.toString()).toList());
                  }
                }
              }
            }
          }
          setState(() {
            _anilistLibrary = tempLibrary.toSet().toList();
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _syncToAnilist(int mediaId, {String? status, int? score, int? progress, String? notes}) async {
    if (_anilistToken == null || mediaId > 2000000000) return;

    const mutation = '''
      mutation(\$mediaId: Int, \$status: MediaListStatus, \$score: Float, \$progress: Int, \$notes: String) {
        SaveMediaListEntry(mediaId: \$mediaId, status: \$status, score: \$score, progress: \$progress, notes: \$notes) {
          id
          status
          score
          progress
          notes
        }
      }
    ''';

    Map<String, dynamic> variables = {'mediaId': mediaId};
    if (status != null) variables['status'] = status;
    if (score != null) variables['score'] = score.toDouble();
    if (progress != null) variables['progress'] = progress;
    if (notes != null) variables['notes'] = notes;

    try {
      await http.post(
        Uri.parse('https://graphql.anilist.co'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_anilistToken',
        },
        body: jsonEncode({'query': mutation, 'variables': variables}),
      );
    } catch (_) {}
  }

  Future<void> _logoutAniList() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('anilist_token');
    await prefs.remove('anilist_username');
    await prefs.remove('anilist_avatar');
    await prefs.remove('anilist_userid');
    setState(() {
      _anilistToken = null;
      _userName = null;
      _userAvatar = null;
      _userId = null;
      _anilistLibrary = [];
    });
    await _fetchAcaraData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final now = DateTime.now();
    final year = now.year;
    String currentSeason;
    
    if (now.month >= 1 && now.month <= 3) {
      currentSeason = 'WINTER';
    } else if (now.month >= 4 && now.month <= 6) {
      currentSeason = 'SPRING';
    } else if (now.month >= 7 && now.month <= 9) {
      currentSeason = 'SUMMER';
    } else {
      currentSeason = 'FALL';
    }
    
    List<Anime> fetchedOngoing = [];
    List<Anime> fetchedFinished = [];

    try {
      const ongoingQuery = '''
        query (\$season: MediaSeason, \$seasonYear: Int, \$perPage: Int) {
          Page(perPage: \$perPage) {
            media(season: \$season, seasonYear: \$seasonYear, type: ANIME, sort: POPULARITY_DESC) {
              id
              title { romaji }
              coverImage { large }
              episodes
              status
              startDate { year month day }
              endDate { year month day }
              nextAiringEpisode { airingAt episode }
            }
          }
        }
      ''';

      var resOngoing = await http.post(
        Uri.parse('https://graphql.anilist.co'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'query': ongoingQuery,
          'variables': {
            'season': currentSeason,
            'seasonYear': year,
            'perPage': 50,
          }
        }),
      );

      if (resOngoing.statusCode == 200) {
        final decoded = jsonDecode(resOngoing.body);
        if (decoded['data'] != null && decoded['data']['Page'] != null) {
          fetchedOngoing = (decoded['data']['Page']['media'] as List).map((x) => Anime.fromJson(x)).toList();
        }
      }

      int currentWeekday = now.weekday; 
      Map<String, int> dayMap = {
        'Senin': 1, 'Selasa': 2, 'Rabu': 3, 'Kamis': 4, 'Jumat': 5, 'Sabtu': 6, 'Minggu': 7
      };

      fetchedOngoing.sort((a, b) {
        int wA = dayMap[a.dayOfWeek] ?? 1;
        int wB = dayMap[b.dayOfWeek] ?? 1;
        
        int diffA = (currentWeekday - wA + 7) % 7;
        int diffB = (currentWeekday - wB + 7) % 7;

        if (diffA != diffB) {
          return diffA.compareTo(diffB);
        }
        if (a.nextAiringAt == null && b.nextAiringAt == null) return 0;
        if (a.nextAiringAt == null) return 1;
        if (b.nextAiringAt == null) return -1;
        return a.nextAiringAt!.compareTo(b.nextAiringAt!);
      });

      const finishedQuery = '''
        query (\$perPage: Int, \$status: MediaStatus) {
          Page(perPage: \$perPage) {
            media(status: \$status, type: ANIME, sort: POPULARITY_DESC) {
              id
              title { romaji }
              coverImage { large }
              episodes
              status
              startDate { year month day }
              endDate { year month day }
            }
          }
        }
      ''';

      var resFinished = await http.post(
        Uri.parse('https://graphql.anilist.co'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'query': finishedQuery,
          'variables': {
            'perPage': 50,
            'status': 'FINISHED',
          }
        }),
      );

      if (resFinished.statusCode == 200) {
        final decodedFin = jsonDecode(resFinished.body);
        if (decodedFin['data'] != null && decodedFin['data']['Page'] != null) {
          fetchedFinished = (decodedFin['data']['Page']['media'] as List).map((x) => Anime.fromJson(x)).toList();
        }
      }

      setState(() {
        _ongoingList = [..._manualAnime.where((m) => m.status != 'FINISHED'), ...fetchedOngoing];
        _finishedList = [..._manualAnime.where((m) => m.status == 'FINISHED'), ...fetchedFinished];
        _loading = false;
      });

      final prefs = await SharedPreferences.getInstance();
      List<Anime> allCombined = [..._ongoingList, ..._finishedList];
      for (var a in allCombined) {
        final w = prefs.getStringList('eps_${a.id}');
        if (w != null) _watched[a.id] = w.map(int.parse).toList();
        final custom = prefs.getString('custom_title_${a.id}');
        if (custom != null && custom.isNotEmpty) _customTitles[a.id] = custom;
        
        final savedEp = prefs.getInt('manual_ep_${a.id}');
        if (savedEp != null) a.currentEpisode = savedEp;

        final st = prefs.getString('status_${a.id}');
        if (st != null) _animeStatus[a.id] = st;
        final sc = prefs.getInt('score_${a.id}');
        if (sc != null) _animeScore[a.id] = sc;
        final nt = prefs.getString('notes_${a.id}');
        if (nt != null) _animeNotes[a.id] = nt;
      }
    } catch (_) {
      setState(() {
        _ongoingList = [..._manualAnime.where((m) => m.status != 'FINISHED')];
        _finishedList = [..._manualAnime.where((m) => m.status == 'FINISHED')];
        _loading = false;
      });
    }
  }

  Future<void> _refreshData() async {
    await _loadData();
    await _fetchAcaraData();
    if (_anilistToken != null) {
      await _fetchAnilistLibrary();
    }
    
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Data berhasil diperbarui!'), duration: Duration(seconds: 1)),
      );
    }
  }

  Future<void> _deleteManualAnime(int id) async {
    setState(() {
      _manualAnime.removeWhere((a) => a.id == id);
      _ongoingList.removeWhere((a) => a.id == id);
      _finishedList.removeWhere((a) => a.id == id);
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('manual_anime', _manualAnime.map((a) => jsonEncode(a.toJson())).toList());
  }

  Future<void> _updateManualEp(int id, int newEp) async {
    setState(() {
      for (var a in _ongoingList) {
        if (a.id == id) a.currentEpisode = newEp;
      }
      for (var a in _finishedList) {
        if (a.id == id) a.currentEpisode = newEp;
      }
      for (var m in _manualAnime) {
        if (m.id == id) m.currentEpisode = newEp;
      }
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('manual_ep_$id', newEp);
    await prefs.setStringList('manual_anime', _manualAnime.map((a) => jsonEncode(a.toJson())).toList());
  }

  void _showAddDialog() {
    final searchController = TextEditingController();
    List<Anime> searchResults = [];
    bool isSearching = false;

    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: Colors.grey.shade900,
          title: const Text('Cari & Tambah Anime (AniList)', style: TextStyle(color: Colors.white, fontSize: 14)),
          content: SizedBox(
            width: double.maxFinite,
            height: 350,
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: searchController,
                        style: const TextStyle(color: Colors.white, fontSize: 12),
                        decoration: const InputDecoration(hintText: 'Ketik judul...', hintStyle: TextStyle(color: Colors.grey)),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.search, color: Colors.blue),
                      onPressed: () async {
                        String query = searchController.text.trim();
                        if (query.isEmpty) return;
                        setDialogState(() => isSearching = true);

                        try {
                          var res = await http.post(
                            Uri.parse('https://graphql.anilist.co'),
                            headers: {'Content-Type': 'application/json'},
                            body: jsonEncode({
                              'query': '''
                                query (\$search: String) {
                                  Page(perPage: 50) {
                                    media(search: \$search, type: ANIME) {
                                      id
                                      title { romaji }
                                      coverImage { large }
                                      episodes
                                      status
                                      startDate { year month day }
                                      endDate { year month day }
                                      nextAiringEpisode { airingAt episode }
                                    }
                                  }
                                }
                              ''',
                              'variables': {'search': query}
                            }),
                          );

                          if (res.statusCode == 200) {
                            final data = jsonDecode(res.body);
                            final list = data['data']?['Page']?['media'] as List?;
                            if (list != null) {
                              setDialogState(() {
                                searchResults = list.map((x) => Anime.fromJson(x)).toList();
                                isSearching = false;
                              });
                            }
                          }
                        } catch (_) {
                          setDialogState(() => isSearching = false);
                        }
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: isSearching
                      ? const Center(child: CircularProgressIndicator())
                      : searchResults.isEmpty
                          ? const Center(child: Text('Ketik judul lalu cari', style: TextStyle(color: Colors.grey, fontSize: 12)))
                          : ListView.builder(
                              itemCount: searchResults.length,
                              itemBuilder: (context, index) {
                                final anime = searchResults[index];
                                return ListTile(
                                  leading: Image.network(anime.image, width: 35, height: 50, fit: BoxFit.cover, errorBuilder: (_,__,___)=>Container(width: 35, color: Colors.grey)),
                                  title: Text(anime.displayTitle, style: const TextStyle(color: Colors.white, fontSize: 12)),
                                  subtitle: Text('Status: ${anime.status}', style: const TextStyle(color: Colors.grey, fontSize: 10)),
                                  trailing: ElevatedButton(
                                    style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, padding: const EdgeInsets.symmetric(horizontal: 8)),
                                    onPressed: () {
                                      setState(() {
                                        if (anime.status == 'FINISHED') {
                                          if (!_finishedList.any((a) => a.id == anime.id)) _finishedList.insert(0, anime);
                                        } else {
                                          if (!_ongoingList.any((a) => a.id == anime.id)) _ongoingList.insert(0, anime);
                                        }
                                        _bookmarks.add(anime.id);
                                      });
                                      _syncToAnilist(anime.id, status: 'CURRENT');
                                      Navigator.pop(dialogContext);
                                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${anime.displayTitle} masuk ke Library!')));
                                    },
                                    child: const Text('Tambah', style: TextStyle(fontSize: 10)),
                                  ),
                                );
                              },
                            ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Tutup')),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleBm(int id) async {
    setState(() {
      if (_bookmarks.contains(id)) {
        _bookmarks.remove(id);
      } else {
        _bookmarks.add(id);
        _syncToAnilist(id, status: 'CURRENT');
      }
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('bm', _bookmarks.map((e) => e.toString()).toList());
    await _fetchAnilistLibrary();
  }

  Future<void> _toggleEp(int id, int ep, {Anime? animeObj}) async {
    setState(() {
      _watched.putIfAbsent(id, () => []);
      if (_watched[id]!.contains(ep)) {
        _watched[id]!.remove(ep);
      } else {
        _watched[id]!.add(ep);     
        if (animeObj != null) {
          bool exists = [..._ongoingList, ..._finishedList, ..._manualAnime].any((a) => a.id == id);
          if (!exists) {
            _manualAnime.insert(0, animeObj);
            _ongoingList.insert(0, animeObj);
          }
        }
      }
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('eps_$id', _watched[id]!.map((e) => e.toString()).toList());
    await prefs.setStringList('manual_anime', _manualAnime.map((a) => jsonEncode(a.toJson())).toList());

    int progressCount = _watched[id]?.length ?? 0;
    await _syncToAnilist(id, progress: progressCount);
  }

  Future<void> _updateProgressCount(int id, int newProgress, int totalEp, {Anime? animeObj}) async {
    if (newProgress < 0 || newProgress > totalEp) return;
    setState(() {
      _watched.putIfAbsent(id, () => []);
      List<int> currentList = _watched[id]!;
      
      if (newProgress > currentList.length) {
        for (int i = 1; i <= newProgress; i++) {
          if (!currentList.contains(i)) {
            currentList.add(i);
          }
        }
      } else {
        currentList.removeWhere((ep) => ep > newProgress);
      }

      if (animeObj != null && newProgress > 0) {
        bool exists = [..._ongoingList, ..._finishedList, ..._manualAnime].any((a) => a.id == id);
        if (!exists) {
          _manualAnime.insert(0, animeObj);
          _ongoingList.insert(0, animeObj);
        }
      }
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('eps_$id', _watched[id]!.map((e) => e.toString()).toList());
    await prefs.setStringList('manual_anime', _manualAnime.map((a) => jsonEncode(a.toJson())).toList());
    await _syncToAnilist(id, progress: newProgress);
  }

  Future<void> _saveCustomTitle(int id, String newTitle) async {
    setState(() => _customTitles[id] = newTitle);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('custom_title_$id', newTitle);
  }

  Future<void> _saveAnimeDetails(int id, String status, int score, String notes) async {
    setState(() {
      _animeStatus[id] = status;
      _animeScore[id] = score;
      _animeNotes[id] = notes;
    });
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('status_$id', status);
    await prefs.setInt('score_$id', score);
    await prefs.setString('notes_$id', notes);

    await _syncToAnilist(id, status: status, score: score, notes: notes);
  }

  @override
  Widget build(BuildContext context) {
    List<Anime> allCombined = [..._ongoingList, ..._finishedList, ..._manualAnime, ..._anilistLibrary];
    
    final Set<int> combinedLibraryIds = {
      ..._anilistLibrary.map((a) => a.id),
      ..._bookmarks,
    };
    
    final libraryList = combinedLibraryIds.map((id) {
      return allCombined.firstWhere(
        (x) => x.id == id, 
        orElse: () => Anime(id: 0, titleRomaji: '', image: '', dayOfWeek: 'Senin', status: 'RELEASING', currentEpisode: 12)
      );
    }).where((x) => x.id != 0).toList();

    int libraryOngoingUpdates = libraryList.where((a) => a.status != 'FINISHED').length;

    final List<Widget> pages = [
      _loading 
          ? const Center(child: CircularProgressIndicator()) 
          : DefaultTabController(
              length: 2,
              child: Column(
                children: [
                  Container(
                    color: Colors.black12,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Expanded(
                          child: TabBar(
                            labelColor: Color(0xFF0088FF),
                            unselectedLabelColor: Colors.grey,
                            tabs: [
                              Tab(text: 'Ongoing'),
                              Tab(text: 'Tamat'),
                            ],
                          ),
                        ),
                        IconButton(icon: const Icon(Icons.add_circle, color: Colors.blue), onPressed: _showAddDialog),
                      ],
                    ),
                  ),
                  Expanded(
                    child: TabBarView(
                      children: [
                        _grid(_ongoingList),
                        _grid(_finishedList),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            
      _loading 
          ? const Center(child: CircularProgressIndicator()) 
          : DefaultTabController(
              length: 7,
              child: Column(
                children: [
                  const TabBar(isScrollable: true, labelColor: Color(0xFF0088FF), unselectedLabelColor: Colors.grey, tabs: [Tab(text: 'Senin'), Tab(text: 'Selasa'), Tab(text: 'Rabu'), Tab(text: 'Kamis'), Tab(text: 'Jumat'), Tab(text: 'Sabtu'), Tab(text: 'Minggu')]),
                  Expanded(
                    child: TabBarView(
                      children: <Widget>[
                        _grid(_ongoingList.where((a) => a.dayOfWeek == 'Senin').toList()),
                        _grid(_ongoingList.where((a) => a.dayOfWeek == 'Selasa').toList()),
                        _grid(_ongoingList.where((a) => a.dayOfWeek == 'Rabu').toList()),
                        _grid(_ongoingList.where((a) => a.dayOfWeek == 'Kamis').toList()),
                        _grid(_ongoingList.where((a) => a.dayOfWeek == 'Jumat').toList()),
                        _grid(_ongoingList.where((a) => a.dayOfWeek == 'Sabtu').toList()),
                        _grid(_ongoingList.where((a) => a.dayOfWeek == 'Minggu').toList()),
                      ],
                    ),
                  ),
                ],
              ),
            ),

      _loadingAcara
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _fetchAcaraData,
              child: ListView(
                padding: const EdgeInsets.all(10),
                children: [
                  const Text('Activity', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white)),
                  const SizedBox(height: 8),
                  _activities.isEmpty 
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 20),
                          child: Center(child: Text('Belum ada aktivitas atau belum login.', style: TextStyle(color: Colors.grey, fontSize: 12))),
                        )
                      : ListView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: _activities.length,
                          itemBuilder: (context, index) {
                            final act = _activities[index];
                            final user = act['user'] ?? {};
                            final userName = user['name'] ?? 'User';
                            final userAvatar = user['avatar']?['large'];
                            final type = act['__typename'];
                            
                            String contentText = '';
                            String? mediaCover;

                            if (type == 'ListActivity') {
                              final status = act['status'] ?? 'watched';
                              final media = act['media'] ?? {};
                              final mediaTitle = media['title']?['romaji'] ?? '';
                              final progress = act['progress'] ?? '';
                              mediaCover = media['coverImage']?['large'];
                              contentText = '$status episode $progress of $mediaTitle';
                            } else if (type == 'TextActivity') {
                              contentText = act['text'] ?? '';
                            }

                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.grey.shade900,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (mediaCover != null && mediaCover.isNotEmpty) ...[
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(4),
                                      child: Image.network(
                                        mediaCover,
                                        width: 50,
                                        height: 70,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, __, ___) => Container(width: 50, height: 70, color: Colors.grey),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                  ],
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            CircleAvatar(
                                              radius: 12,
                                              backgroundImage: userAvatar != null ? NetworkImage(userAvatar) : null,
                                              child: userAvatar == null ? const Icon(Icons.person, size: 12) : null,
                                            ),
                                            const SizedBox(width: 6),
                                            Text(userName, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blueAccent, fontSize: 12)),
                                          ],
                                        ),
                                        const SizedBox(height: 6),
                                        Text(contentText, style: const TextStyle(color: Colors.white, fontSize: 12)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ],
              ),
            ),

      _grid(libraryList),

      Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_userName != null) ...[
                CircleAvatar(
                  radius: 40,
                  backgroundImage: _userAvatar != null ? NetworkImage(_userAvatar!) : null,
                  child: _userAvatar == null ? const Icon(Icons.person, size: 40) : null,
                ),
                const SizedBox(height: 12),
                Text('Akun: $_userName', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
                  onPressed: _logoutAniList,
                  icon: const Icon(Icons.logout),
                  label: const Text('Keluar (Logout AniList)'),
                ),
              ] else ...[
                const Icon(Icons.account_circle, size: 80, color: Colors.grey),
                const SizedBox(height: 12),
                const Text('Belum terhubung ke akun AniList', style: TextStyle(color: Colors.grey, fontSize: 14)),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0088FF)),
                  onPressed: _loginAniList,
                  icon: const Icon(Icons.login),
                  label: const Text('Login ke AniList'),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: _showTokenInputDialog,
                  child: const Text('Masukkan Token Manual', style: TextStyle(color: Colors.white)),
                ),
              ],
            ],
          ),
        ),
      ),
    ];

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(40),
        child: AppBar(
          backgroundColor: Colors.blueGrey.shade900,
          elevation: 0,
          title: Row(
            children: [
              const Icon(Icons.notifications_active, color: Colors.amber, size: 16),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Info: $libraryOngoingUpdates anime Library ongoing aktif updatenya!',
                  style: const TextStyle(fontSize: 11, color: Colors.white70),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refreshData,
          child: pages[_index],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFF0088FF),
        unselectedItemColor: Colors.grey,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.calendar_today), label: 'Jadwal'),
          BottomNavigationBarItem(icon: Icon(Icons.tv), label: 'Acara'),
          BottomNavigationBarItem(icon: Icon(Icons.bookmark), label: 'Library'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profil'),
        ],
      ),
    );
  }

  Widget _grid(List<Anime> list) {
    if (list.isEmpty) return const Center(child: Text('Tidak ada data anime', style: TextStyle(color: Colors.grey, fontSize: 12)));
    return GridView.builder(
      padding: const EdgeInsets.all(10),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3, 
        childAspectRatio: 0.55, 
        crossAxisSpacing: 8, 
        mainAxisSpacing: 8,
      ),
      itemCount: list.length,
      itemBuilder: (c, i) => _card(list[i]),
    );
  }

  Widget _card(Anime a) {
    int displayEp = a.currentEpisode;
    if (a.nextAiringEpisodeNum != null && a.nextAiringEpisodeNum! > 1) {
      displayEp = a.nextAiringEpisodeNum! - 1;
    }

    return GestureDetector(
      onTap: () async {
        await Navigator.push(context, MaterialPageRoute(builder: (_) => DetailScreen(
          anime: a,
          initialCustomTitle: _customTitles[a.id] ?? a.displayTitle,
          isBm: _bookmarks.contains(a.id),
          watched: _watched[a.id] ?? [],
          isManual: _manualAnime.any((m) => m.id == a.id),
          initialStatus: _animeStatus[a.id] ?? 'CURRENT',
          initialScore: _animeScore[a.id] ?? 0,
          initialNotes: _animeNotes[a.id] ?? '',
          onBm: () => _toggleBm(a.id),
          onEp: (ep) => _toggleEp(a.id, ep, animeObj: a),
          onChangeProgress: (newProg) => _updateProgressCount(a.id, newProg, a.currentEpisode > 0 ? a.currentEpisode : 12, animeObj: a),
          onSaveTitle: (title) => _saveCustomTitle(a.id, title),
          onDeleteManual: () => _deleteManualAnime(a.id),
          onUpdateEp: (newEp) => _updateManualEp(a.id, newEp),
          onSaveDetails: (status, score, notes) => _saveAnimeDetails(a.id, status, score, notes),
        )));
        setState(() {});
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: a.image.isNotEmpty
                      ? Image.network(
                          a.image,
                          fit: BoxFit.cover,
                          width: double.infinity,
                          height: double.infinity,
                          errorBuilder: (c, o, s) => _placeholderBox(a.displayTitle),
                        )
                      : _placeholderBox(a.displayTitle),
                ),
                Positioned(
                  top: 4,
                  right: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.75),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'Ep $displayEp',
                      style: const TextStyle(fontSize: 9, color: Colors.amberAccent, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(a.displayTitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: Colors.white)),
        ],
      ),
    );
  }

  Widget _placeholderBox(String title) {
    return Container(
      color: Colors.grey.shade800,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}

class DetailScreen extends StatefulWidget {
  final Anime anime;
  final String initialCustomTitle;
  final bool isBm;
  final List<int> watched;
  final bool isManual;
  final String initialStatus;
  final int initialScore;
  final String initialNotes;
  final VoidCallback onBm;
  final Function(int) onEp;
  final Function(int) onChangeProgress;
  final Function(String) onSaveTitle;
  final VoidCallback onDeleteManual;
  final Function(int) onUpdateEp;
  final Function(String, int, String) onSaveDetails;

  const DetailScreen({
    super.key,
    required this.anime,
    required this.initialCustomTitle,
    required this.isBm,
    required this.watched,
    required this.isManual,
    required this.initialStatus,
    required this.initialScore,
    required this.initialNotes,
    required this.onBm,
    required this.onEp,
    required this.onChangeProgress,
    required this.onSaveTitle,
    required this.onDeleteManual,
    required this.onUpdateEp,
    required this.onSaveDetails,
  });

  @override
  State<DetailScreen> createState() => _DetailScreenState();
}

class _DetailScreenState extends State<DetailScreen> {
  late bool bm;
  late List<int> wList;
  late TextEditingController _searchController;
  late TextEditingController _notesController;
  late TextEditingController _scoreController;
  late String _selectedStatus;
  late int _selectedScore;

  @override
  void initState() {
    super.initState();
    bm = widget.isBm;
    wList = List.from(widget.watched);
    _searchController = TextEditingController(text: widget.initialCustomTitle);
    _notesController = TextEditingController(text: widget.initialNotes);
    _scoreController = TextEditingController(text: widget.initialScore.toString());
    _selectedStatus = widget.initialStatus;
    _selectedScore = widget.initialScore;
  }

  @override
  void dispose() {
    _searchController.dispose();
    _notesController.dispose();
    _scoreController.dispose();
    super.dispose();
  }

  Future<void> _openDirectEpisodeUrl(int ep, String webType) async {
    widget.onSaveTitle(_searchController.text);
    widget.onSaveDetails(_selectedStatus, _selectedScore, _notesController.text);

    String rawTitle = _searchController.text.trim();
    String cleanTitle = rawTitle
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9\s-]'), '')
        .replaceAll(RegExp(r'\s+'), '-');

    Uri targetUrl;

    if (webType == 'samehadaku') {
      targetUrl = Uri.parse('https://samehadaku.li/$cleanTitle-episode-$ep-subtitle-indonesia/');
    } else {
      targetUrl = Uri.parse('https://kuronime.sbs/nonton-$cleanTitle-episode-$ep/');
    }

    try {
      await launchUrl(targetUrl, mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  void _showStreamingDialog(int ep) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.grey.shade900,
        title: Text('Pilih Web Streaming - Episode $ep', style: const TextStyle(color: Colors.white, fontSize: 14)),
        content: const Text(
          'Pilih situs web streaming untuk langsung membuka episode tersebut.',
          style: TextStyle(color: Colors.grey, fontSize: 12),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              _openDirectEpisodeUrl(ep, 'samehadaku');
            },
            child: const Text('Samehadaku.li', style: TextStyle(color: Colors.blueAccent)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.deepOrange),
            onPressed: () {
              Navigator.pop(dialogContext);
              _openDirectEpisodeUrl(ep, 'kuronime');
            },
            child: const Text('Kuronime.sbs', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showSearchWebDialog() {
    widget.onSaveTitle(_searchController.text);
    widget.onSaveDetails(_selectedStatus, _selectedScore, _notesController.text);

    String rawTitle = _searchController.text.trim();
    String queryTitle = rawTitle.replaceAll(' ', '+');

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.grey.shade900,
        title: const Text('Cari Anime di Web', style: TextStyle(color: Colors.white, fontSize: 14)),
        content: const Text('Pilih situs web streaming untuk mencari judul anime ini.', style: TextStyle(color: Colors.grey, fontSize: 12)),
        actions: [
          TextButton(
            onPressed: () async {
              Navigator.pop(dialogContext);
              try {
                await launchUrl(Uri.parse('https://samehadaku.li/?s=$queryTitle'), mode: LaunchMode.externalApplication);
              } catch (_) {}
            },
            child: const Text('Samehadaku.li', style: TextStyle(color: Colors.blueAccent)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.deepOrange),
            onPressed: () async {
              Navigator.pop(dialogContext);
              try {
                await launchUrl(Uri.parse('https://kuronime.sbs/?s=$queryTitle'), mode: LaunchMode.externalApplication);
              } catch (_) {}
            },
            child: const Text('Kuronime.sbs', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showAddEpisodeDialog() {
    final epController = TextEditingController(text: '${widget.anime.currentEpisode + 1}');
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.grey.shade900,
        title: const Text('Tambah Episode Baru', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: TextField(
          controller: epController,
          keyboardType: TextInputType.number,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(labelText: 'Total Episode Terbaru'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () {
              final newEp = int.tryParse(epController.text);
              if (newEp != null && newEp > 0) {
                widget.onUpdateEp(newEp);
                setState(() {});
                Navigator.pop(dialogContext);
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  String _getEpisodeDate(int ep, int total) {
    if (widget.anime.nextAiringAt != null && widget.anime.nextAiringEpisodeNum != null) {
      int targetEp = widget.anime.nextAiringEpisodeNum!;
      int diffEp = ep - targetEp;
      int targetTimestamp = widget.anime.nextAiringAt! + (diffEp * 7 * 24 * 60 * 60);
      
      DateTime date = DateTime.fromMillisecondsSinceEpoch(targetTimestamp * 1000, isUtc: true).toLocal();
      
      String dateStr = '${date.day.toString().padLeft(2, '0')}-${date.month.toString().padLeft(2, '0')}-${date.year}';
      String relativeStr = _getRelativeTime(date);
      return '$dateStr ($relativeStr)';
    } else if (widget.anime.startDateStr != null) {
      try {
        List<String> parts = widget.anime.startDateStr!.split('-');
        int d = int.parse(parts[0]);
        int m = int.parse(parts[1]);
        int y = int.parse(parts[2]);
        DateTime baseDate = DateTime(y, m, d).add(Duration(days: (ep - 1) * 7));
        String dateStr = '${baseDate.day.toString().padLeft(2, '0')}-${baseDate.month.toString().padLeft(2, '0')}-${baseDate.year}';
        String relativeStr = _getRelativeTime(baseDate);
        return '$dateStr ($relativeStr)';
      } catch (_) {}
    }
    return '';
  }

  String _getRelativeTime(DateTime targetDate) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final targetDay = DateTime(targetDate.year, targetDate.month, targetDate.day);
    
    final difference = today.difference(targetDay).inDays;

    if (difference == 0) {
      return 'Hari ini';
    } else if (difference == 1) {
      return 'Kemarin';
    } else if (difference > 1 && difference < 7) {
      return '$difference hari yang lalu';
    } else if (difference >= 7 && difference < 14) {
      return 'Seminggu yang lalu';
    } else if (difference >= 14 && difference < 30) {
      int weeks = (difference / 7).floor();
      return '$weeks minggu yang lalu';
    } else if (difference >= 30 && difference < 365) {
      int months = (difference / 30).floor();
      return months == 1 ? 'Sebulan yang lalu' : '$months bulan yang lalu';
    } else if (difference >= 365) {
      int years = (difference / 365).floor();
      return years == 1 ? 'Setahun yang lalu' : '$years tahun yang lalu';
    } else {
      int futureDays = -difference;
      if (futureDays < 7) {
        return '$futureDays hari lagi';
      } else if (futureDays >= 7 && futureDays < 14) {
        return 'Seminggu lagi';
      } else {
        int weeks = (futureDays / 7).floor();
        return '$weeks minggu lagi';
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    int total = widget.anime.currentEpisode > 0 ? widget.anime.currentEpisode : 12;
    int progressCount = wList.length;

    String startText = widget.anime.startDateStr ?? '-';
    String endText = widget.anime.endDateStr ?? 'Ongoing / Seterusnya';

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.anime.displayTitle, style: const TextStyle(fontSize: 14)),
        actions: [
          if (widget.isManual) ...[
            IconButton(
              icon: const Icon(Icons.add_box, color: Colors.greenAccent),
              tooltip: 'Tambah Episode',
              onPressed: _showAddEpisodeDialog,
            ),
            IconButton(
              icon: const Icon(Icons.delete, color: Colors.redAccent),
              onPressed: () {
                widget.onDeleteManual();
                Navigator.pop(context);
              },
            ),
          ],
          IconButton(
            icon: Icon(bm ? Icons.bookmark : Icons.bookmark_border, color: bm ? Colors.amber : Colors.white),
            onPressed: () {
              setState(() => bm = !bm);
              widget.onBm();
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: widget.anime.image.isNotEmpty
                        ? Image.network(widget.anime.image, width: 70, height: 100, fit: BoxFit.cover, errorBuilder: (_,__,___)=>Container(width: 70, color: Colors.grey))
                        : Container(width: 70, height: 100, color: Colors.grey, child: const Center(child: Icon(Icons.movie, size: 30))),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.anime.displayTitle, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white)),
                        const SizedBox(height: 4),
                        Text('Tayang: $startText s/d $endText', style: const TextStyle(color: Colors.amberAccent, fontSize: 10)),
                        const SizedBox(height: 4),
                        const Text('Edit judul untuk dicari ke web:', style: TextStyle(color: Colors.blueAccent, fontSize: 9)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      onChanged: (val) => widget.onSaveTitle(val),
                      style: const TextStyle(fontSize: 12, color: Colors.white),
                      decoration: InputDecoration(
                        isDense: true,
                        contentPadding: const EdgeInsets.all(8),
                        filled: true,
                        fillColor: Colors.grey.shade900,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.blue),
                    onPressed: _showSearchWebDialog,
                    child: const Text('Cari Web', style: TextStyle(fontSize: 12, color: Colors.white)),
                  ),
                ],
              ),
              const SizedBox(height: 15),
              const Text('Status', style: TextStyle(color: Colors.grey, fontSize: 11)),
              const SizedBox(height: 4),
              DropdownButtonFormField<String>(
                value: _selectedStatus,
                dropdownColor: Colors.grey.shade800,
                style: const TextStyle(color: Colors.white, fontSize: 12),
                items: const [
                  DropdownMenuItem(value: 'CURRENT', child: Text('Watching')),
                  DropdownMenuItem(value: 'COMPLETED', child: Text('Completed')),
                  DropdownMenuItem(value: 'PAUSED', child: Text('Paused')),
                  DropdownMenuItem(value: 'DROPPED', child: Text('Dropped')),
                  DropdownMenuItem(value: 'PLANNING', child: Text('Planning')),
                ],
                onChanged: (val) {
                  setState(() => _selectedStatus = val ?? 'CURRENT');
                  widget.onSaveDetails(_selectedStatus, _selectedScore, _notesController.text);
                },
                decoration: InputDecoration(
                  isDense: true,
                  filled: true,
                  fillColor: Colors.grey.shade900,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Score (0 - 10)', style: TextStyle(color: Colors.grey, fontSize: 11)),
                        const SizedBox(height: 4),
                        TextField(
                          controller: _scoreController,
                          keyboardType: TextInputType.number,
                          style: const TextStyle(color: Colors.white, fontSize: 12),
                          onChanged: (val) {
                            _selectedScore = int.tryParse(val) ?? 0;
                            widget.onSaveDetails(_selectedStatus, _selectedScore, _notesController.text);
                          },
                          decoration: InputDecoration(
                            isDense: true,
                            filled: true,
                            fillColor: Colors.grey.shade900,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: BorderSide.none),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Episode Progress', style: TextStyle(color: Colors.grey, fontSize: 11)),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade900,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('$progressCount / $total', style: const TextStyle(color: Colors.white, fontSize: 12)),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  InkWell(
                                    onTap: () {
                                      if (progressCount > 0) {
                                        int newProg = progressCount - 1;
                                        List<int> updatedList = [];
                                        for (int i = 1; i <= newProg; i++) {
                                          updatedList.add(i);
                                        }
                                        setState(() => wList = updatedList);
                                        widget.onChangeProgress(newProg);
                                      }
                                    },
                                    child: const Icon(Icons.arrow_drop_down, color: Colors.white, size: 24),
                                  ),
                                  InkWell(
                                    onTap: () {
                                      if (progressCount < total) {
                                        int newProg = progressCount + 1;
                                        List<int> updatedList = List.from(wList);
                                        if (!updatedList.contains(newProg)) {
                                          updatedList.add(newProg);
                                        }
                                        setState(() => wList = updatedList);
                                        widget.onChangeProgress(newProg);
                                      }
                                    },
                                    child: const Icon(Icons.arrow_drop_up, color: Colors.white, size: 24),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text('Notes', style: TextStyle(color: Colors.grey, fontSize: 11)),
              const SizedBox(height: 4),
              TextField(
                controller: _notesController,
                maxLines: 2,
                style: const TextStyle(color: Colors.white, fontSize: 12),
                onChanged: (val) => widget.onSaveDetails(_selectedStatus, _selectedScore, val),
                decoration: InputDecoration(
                  isDense: true,
                  filled: true,
                  fillColor: Colors.grey.shade900,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: BorderSide.none),
                  hintText: 'Tulis catatan...',
                  hintStyle: const TextStyle(color: Colors.grey, fontSize: 11),
                ),
              ),
              const Divider(color: Colors.grey, height: 25),
              const Text('Daftar Episode', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.white)),
              const SizedBox(height: 5),
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: total,
                itemBuilder: (c, i) {
                  int ep = total - i;
                  bool watched = wList.contains(ep);
                  String epDate = _getEpisodeDate(ep, total);
                  return ListTile(
                    dense: true,
                    title: Text('Episode $ep', style: const TextStyle(color: Colors.white)),
                    subtitle: epDate.isNotEmpty ? Text(epDate, style: const TextStyle(color: Colors.grey, fontSize: 10)) : null,
                    onTap: () => _showStreamingDialog(ep),
                    trailing: Checkbox(
                      value: watched,
                      onChanged: (val) {
                        setState(() {
                          if (watched) {
                            wList.remove(ep);
                          } else {
                            if (!wList.contains(ep)) wList.add(ep);
                          }
                        });
                        widget.onEp(ep);
                      },
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
